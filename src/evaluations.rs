use super::*;
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Answer {
    option_id: Option<String>,
    observation: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Submission {
    answers: BTreeMap<String, Answer>,
    observation: String,
    finalize: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Agreement {
    agree: bool,
    observation: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Preview {
    answers: BTreeMap<String, Answer>,
}

fn template<'a>(seed: &'a Value, id: &str) -> ApiResult<&'a Value> {
    values(&seed["evaluations"])
        .iter()
        .find(|item| item["id"] == id)
        .ok_or_else(missing)
}

fn observation(text: &str, max: usize) -> ApiResult<String> {
    if text.chars().count() > max {
        return Err(invalid(&format!(
            "A observação deve ter até {max} caracteres."
        )));
    }
    Ok(text.trim().to_owned())
}

fn validate_answers(template: &Value, input: Submission) -> ApiResult<(Value, String, bool)> {
    let questions = values(&template["questions"]);
    if input
        .answers
        .keys()
        .any(|id| !questions.iter().any(|q| q["id"] == *id))
    {
        return Err(invalid("Pergunta não encontrada neste questionário."));
    }
    let mut answers = serde_json::Map::new();
    for q in questions {
        let id = q["id"].as_str().unwrap();
        let answer = input.answers.get(id);
        let option = answer.and_then(|a| a.option_id.as_deref());
        let note = observation(answer.map(|a| a.observation.as_str()).unwrap_or(""), 4000)?;
        let selected = if let Some(option) = option {
            Some(
                values(&q["options"])
                    .iter()
                    .find(|o| o["id"] == option)
                    .ok_or_else(|| invalid("Resposta não pertence a esta pergunta."))?,
            )
        } else {
            None
        };
        if input.finalize && q["required"] == true && selected.is_none() {
            return Err(invalid(
                "Responda todas as perguntas obrigatórias antes de finalizar.",
            ));
        }
        if input.finalize
            && selected.is_some_and(|o| o["requiresObservation"] == true)
            && note.is_empty()
        {
            return Err(invalid(
                "Informe a observação exigida pela resposta selecionada.",
            ));
        }
        answers.insert(id.to_owned(), json!({"optionId":option,"observation":note}));
    }
    Ok((
        Value::Object(answers),
        observation(&input.observation, 255)?,
        input.finalize,
    ))
}

fn score(template: &Value, answers: &Value) -> ApiResult<Value> {
    let configuration_error = || {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "A regra de pontuação do exemplo está inválida.".into(),
        )
    };
    let mode = template["scoreMode"]
        .as_str()
        .ok_or_else(configuration_error)?;
    if !["sum", "weighted-average"].contains(&mode) {
        return Err(configuration_error());
    }
    let mut contributions = vec![];
    let (mut weighted_total, mut maximum_total, mut weights, mut answered) = (0.0, 0.0, 0.0, 0);
    for q in values(&template["questions"]) {
        let weight = q["weight"]
            .as_f64()
            .filter(|w| *w > 0.0)
            .ok_or_else(configuration_error)?;
        let options = values(&q["options"]);
        let maximum = options
            .iter()
            .map(|o| o["points"].as_f64().ok_or_else(configuration_error))
            .collect::<ApiResult<Vec<_>>>()?
            .into_iter()
            .reduce(f64::max)
            .ok_or_else(configuration_error)?;
        let selected = options
            .iter()
            .find(|o| o["id"] == answers[q["id"].as_str().unwrap()]["optionId"]);
        let points = selected.map(|o| o["points"].as_f64().unwrap());
        let weighted_points = points.unwrap_or(0.0) * weight;
        weighted_total += weighted_points;
        maximum_total += maximum * weight;
        weights += weight;
        answered += usize::from(selected.is_some());
        contributions.push(json!({"questionId":q["id"],"title":q["title"],"points":points,"weight":weight,"weightedPoints":weighted_points}));
    }
    let denominator = if mode == "sum" { 1.0 } else { weights };
    if denominator <= 0.0 {
        return Err(configuration_error());
    }
    Ok(
        json!({"mode":mode,"score":weighted_total / denominator,"maximum":maximum_total / denominator,
        "weightedTotal":weighted_total,"denominator":denominator,"answered":answered,"total":contributions.len(),"contributions":contributions}),
    )
}

pub(super) fn preview(seed: &Value, id: &str, body: &[u8]) -> ApiResult<Value> {
    let template = template(seed, id)?;
    let input: Preview = parse(body)?;
    let (answers, _, _) = validate_answers(
        template,
        Submission {
            answers: input.answers,
            observation: String::new(),
            finalize: false,
        },
    )?;
    // A preview shares validation and scoring with persistence, but never writes or finalizes.
    score(template, &answers)
}

pub(super) async fn detail<C: GenericClient + Sync>(
    db: &C,
    seed: &Value,
    id: &str,
) -> ApiResult<Value> {
    let mut item = template(seed, id)?.clone();
    if let Some(row) = db.query_opt("SELECT answers,observation,finished,agreement,to_jsonb(updated_at) FROM demo_evaluation_responses WHERE evaluation_id=$1", &[&id]).await? {
        item["answers"] = row.get(0);
        item["observation"] = json!(row.get::<_,String>(1));
        item["status"] = json!(if row.get::<_,bool>(2) { "completed" } else { "draft" });
        item["agreement"] = json!(row.get::<_,Option<bool>>(3));
        item["updatedAt"] = row.get(4);
        if item["status"] == "completed" && item["section"] == "pending" { item["section"] = json!("answered"); }
    }
    item["scoreSummary"] = score(&item, &item["answers"])?;
    item["score"] = item["scoreSummary"]["score"].clone();
    item["readOnly"] = json!(item["status"] == "completed" || item["action"] == "agreement");
    Ok(item)
}

pub(super) async fn list<C: GenericClient + Sync>(db: &C, seed: &Value) -> ApiResult<Value> {
    let mut items = vec![];
    for item in values(&seed["evaluations"]) {
        let mut item = detail(db, seed, item["id"].as_str().unwrap()).await?;
        let object = item.as_object_mut().unwrap();
        object.remove("questions");
        object.remove("answers");
        object.remove("observation");
        object.remove("scoreSummary");
        items.push(item);
    }
    Ok(json!(items))
}

pub(super) async fn save(
    state: &AppState,
    id: &str,
    action: &str,
    role: &str,
    body: &[u8],
) -> ApiResult<Response> {
    let template = template(&state.seed, id)?;
    if template["status"] == "completed" {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Esta avaliação é somente para consulta.".into(),
        ));
    }
    let (answers, note, finish, agreement) = match (action, template["action"].as_str().unwrap()) {
        ("answers", "questionnaire") => {
            let (answers, note, finish) = validate_answers(template, parse(body)?)?;
            (answers, note, finish, None)
        }
        ("agreement", "agreement") => {
            let input: Agreement = parse(body)?;
            (
                template["answers"].clone(),
                observation(&input.observation, 255)?,
                true,
                Some(input.agree),
            )
        }
        _ => return Err(invalid("Ação não disponível nesta avaliação.")),
    };
    let mut db = state.db.lock().await;
    let tx = db.transaction().await?;
    // The same row owns editing and finalization, so a finalized response cannot be overwritten.
    tx.execute(
        "INSERT INTO demo_evaluation_responses(evaluation_id) VALUES($1) ON CONFLICT DO NOTHING",
        &[&id],
    )
    .await?;
    let finished: bool = tx
        .query_one(
            "SELECT finished FROM demo_evaluation_responses WHERE evaluation_id=$1 FOR UPDATE",
            &[&id],
        )
        .await?
        .get(0);
    if finished {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Avaliação já finalizada. Abra novamente para consultar.".into(),
        ));
    }
    tx.execute("UPDATE demo_evaluation_responses SET answers=$2,observation=$3,finished=$4,agreement=$5,updated_at=now() WHERE evaluation_id=$1",&[&id,&answers,&note,&finish,&agreement]).await?;
    audit(
        &tx,
        role,
        if agreement.is_some() {
            "evaluation.agreement"
        } else if finish {
            "evaluation.finalized"
        } else {
            "evaluation.draft"
        },
        id,
        json!({"finished":finish,"agreement":agreement}),
    )
    .await?;
    if finish {
        notice(
            &tx,
            "requests",
            "Avaliação fictícia atualizada",
            "Consulte a resposta registrada na demonstração.",
            "/governo-digital/servidor/contratos/DEMO-001?tab=avaliacoes",
        )
        .await?;
    }
    let result = detail(&tx, &state.seed, id).await?;
    tx.commit().await?;
    Ok(ok(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drafts_can_be_partial_but_final_answers_and_observations_are_required() {
        let seed = fixture();
        let t = template(&seed, "demo-eval-1").unwrap();
        let draft = Submission {
            answers: BTreeMap::new(),
            observation: String::new(),
            finalize: false,
        };
        assert!(validate_answers(t, draft).is_ok());
        let final_input = Submission {
            answers: BTreeMap::new(),
            observation: String::new(),
            finalize: true,
        };
        assert!(validate_answers(t, final_input).is_err());
        let input = json!({"answers":{"q1":{"optionId":"regular","observation":""},"q2":{"optionId":"review","observation":""}},"observation":"","finalize":true});
        assert!(validate_answers(t, parse(&serde_json::to_vec(&input).unwrap()).unwrap()).is_err());
    }

    #[test]
    fn answer_identity_and_server_scoring_use_the_template() {
        let seed = fixture();
        let t = template(&seed, "demo-eval-1").unwrap();
        for input in [
            json!({"answers":{"foreign":{"optionId":"regular","observation":""}},"observation":"","finalize":false}),
            json!({"answers":{"q1":{"optionId":"foreign","observation":""}},"observation":"","finalize":false}),
        ] {
            assert!(
                validate_answers(t, parse(&serde_json::to_vec(&input).unwrap()).unwrap()).is_err()
            );
        }
        assert_eq!(
            score(
                t,
                &json!({"q1":{"optionId":"regular"},"q2":{"optionId":"review"}})
            )
            .unwrap()["score"],
            json!(7.0)
        );
        assert!(
            parse::<Submission>(br#"{"answers":{},"observation":"","finalize":false,"score":100}"#)
                .is_err()
        );
    }

    #[test]
    fn weighted_average_counts_all_weights_and_preserves_unanswered_questions() {
        let seed = fixture();
        let t = template(&seed, "demo-eval-5").unwrap();
        let complete = score(
            t,
            &json!({"q1":{"optionId":"regular"},"q2":{"optionId":"review"}}),
        )
        .unwrap();
        assert_eq!(complete["score"], 4.0);
        assert_eq!(complete["maximum"], 5.0);
        assert_eq!(complete["weightedTotal"], 12.0);
        assert_eq!(complete["denominator"], 3.0);
        assert_eq!(complete["answered"], 2);
        let partial = score(t, &json!({"q1":{"optionId":"regular"}})).unwrap();
        assert!((partial["score"].as_f64().unwrap() - 10.0 / 3.0).abs() < 1e-10);
        assert_eq!(partial["answered"], 1);
        assert_eq!(partial["contributions"][1]["points"], Value::Null);
        assert_eq!(partial["contributions"][1]["weightedPoints"], 0.0);
        assert_eq!(score(t, &json!({})).unwrap()["score"], 0.0);
        let mut invalid_rule = t.clone();
        invalid_rule["scoreMode"] = json!("unknown");
        assert!(score(&invalid_rule, &json!({})).is_err());
        invalid_rule["scoreMode"] = json!("weighted-average");
        invalid_rule["questions"][0]["weight"] = json!(0);
        assert!(score(&invalid_rule, &json!({})).is_err());
    }

    #[test]
    fn preview_validates_answers_and_never_accepts_caller_scores_or_finalization() {
        let seed = fixture();
        let body =
            serde_json::to_vec(&json!({"answers":{"q1":{"optionId":"regular","observation":""}}}))
                .unwrap();
        assert_eq!(preview(&seed, "demo-eval-1", &body).unwrap()["score"], 5.0);
        for body in [
            json!({"answers":{},"score":100}),
            json!({"answers":{},"finalize":true}),
            json!({"answers":{"q1":{"optionId":"foreign","observation":""}}}),
        ] {
            assert!(preview(&seed, "demo-eval-1", &serde_json::to_vec(&body).unwrap()).is_err());
        }
        assert_eq!(
            preview(&seed, "missing", b"{}").unwrap_err().0,
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn observation_limits_count_unicode_characters() {
        assert!(observation(&"é".repeat(255), 255).is_ok());
        assert!(observation(&"é".repeat(256), 255).is_err());
        assert!(observation(&"a".repeat(4001), 4000).is_err());
    }
}
