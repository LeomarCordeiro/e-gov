use super::*;

pub(super) const MAX_ATTACHMENT_BYTES: usize = 2 * 1024 * 1024;
const MAX_ATTACHMENTS: i64 = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Stage {
    Filling,
    Review,
    Acknowledgment,
    Completed,
}

impl Stage {
    pub(super) fn parse(value: Option<&str>) -> ApiResult<Self> {
        match value {
            None | Some("filling") => Ok(Self::Filling),
            Some("review") => Ok(Self::Review),
            Some("acknowledgment") => Ok(Self::Acknowledgment),
            Some("completed") => Ok(Self::Completed),
            _ => Err(ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Etapa local desconhecida.".into(),
            )),
        }
    }
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Filling => "filling",
            Self::Review => "review",
            Self::Acknowledgment => "acknowledgment",
            Self::Completed => "completed",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Filling => "Preenchimento",
            Self::Review => "Revisão pelo RH simulado",
            Self::Acknowledgment => "Ciência do servidor",
            Self::Completed => "Fluxo local concluído",
        }
    }
}

pub(super) fn enabled(template: &Value) -> bool {
    template["workflowEnabled"] == true
}

pub(super) fn project(item: &mut Value, stage: Stage) {
    let actions = match stage {
        Stage::Review => json!([
            {"action":"return","role":"rh","label":"Devolver para ajustes"},
            {"action":"approve","role":"rh","label":"Encaminhar para ciência"}
        ]),
        Stage::Acknowledgment => json!([
            {"action":"agree","role":"servidor","label":"Concordar e concluir (simulação)"},
            {"action":"disagree","role":"servidor","label":"Discordar e concluir (simulação)"}
        ]),
        _ => json!([]),
    };
    item["workflow"] = json!({"stage":stage.name(),"label":stage.label(),"actions":actions});
    item["readOnly"] = json!(stage != Stage::Filling);
    match stage {
        Stage::Filling => (),
        Stage::Review => item["status"] = json!("in-review"),
        Stage::Acknowledgment => item["status"] = json!("awaiting-acknowledgment"),
        Stage::Completed => {
            item["status"] = json!("completed");
            item["section"] = json!("answered");
        }
    }
}

pub(super) async fn enrich<C: GenericClient + Sync>(db: &C, item: &mut Value) -> ApiResult<()> {
    let id = item["id"].as_str().unwrap().to_owned();
    item["attachments"] = json!(db.query("SELECT jsonb_build_object('id',id::text,'filename',filename,'mediaType',media_type,'bytes',octet_length(content),'actor',actor,'createdAt',created_at) FROM demo_evaluation_attachments WHERE evaluation_id=$1 ORDER BY id",&[&id]).await?.iter().map(|r|r.get::<_,Value>(0)).collect::<Vec<_>>());
    item["events"] = json!(db.query("SELECT jsonb_build_object('id',id::text,'action',action,'stage',stage,'actor',actor,'observation',observation,'createdAt',created_at) FROM demo_evaluation_events WHERE evaluation_id=$1 ORDER BY id",&[&id]).await?.iter().map(|r|r.get::<_,Value>(0)).collect::<Vec<_>>());
    item["attachmentPolicy"] = json!({"maxBytes":MAX_ATTACHMENT_BYTES,"maxFiles":MAX_ATTACHMENTS,"extensions":["pdf","txt"]});
    Ok(())
}

pub(super) async fn event<C: GenericClient + Sync>(
    db: &C,
    id: &str,
    role: &str,
    action: &str,
    stage: &str,
    note: &str,
) -> ApiResult<()> {
    db.execute("INSERT INTO demo_evaluation_events(evaluation_id,actor,action,stage,observation) VALUES($1,$2,$3,$4,$5)",&[&id,&role,&action,&stage,&note]).await?;
    audit(
        db,
        role,
        &format!("evaluation.{action}"),
        id,
        json!({"stage":stage}),
    )
    .await
}

pub(super) async fn lock_response(
    tx: &tokio_postgres::Transaction<'_>,
    id: &str,
) -> ApiResult<(bool, Stage)> {
    tx.execute(
        "INSERT INTO demo_evaluation_responses(evaluation_id) VALUES($1) ON CONFLICT DO NOTHING",
        &[&id],
    )
    .await?;
    let row=tx.query_one("SELECT finished,workflow_stage FROM demo_evaluation_responses WHERE evaluation_id=$1 FOR UPDATE",&[&id]).await?;
    let stage: Option<String> = row.get(1);
    Ok((row.get(0), Stage::parse(stage.as_deref())?))
}

fn transition(stage: Stage, role: &str, action: &str) -> ApiResult<Stage> {
    let expected_role = match action {
        "return" | "approve" => "rh",
        "agree" | "disagree" => "servidor",
        _ => return Err(invalid("Ação de tramitação desconhecida.")),
    };
    if role != expected_role {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Troque para o papel correspondente no seletor da demonstração.".into(),
        ));
    }
    match (stage, action) {
        (Stage::Review, "return") => Ok(Stage::Filling),
        (Stage::Review, "approve") => Ok(Stage::Acknowledgment),
        (Stage::Acknowledgment, "agree" | "disagree") => Ok(Stage::Completed),
        _ => Err(ApiError(
            StatusCode::CONFLICT,
            "Esta ação não está disponível na etapa atual. Atualize a avaliação.".into(),
        )),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Transition {
    action: String,
    observation: String,
}

pub(super) async fn advance(
    state: &AppState,
    id: &str,
    role: &str,
    body: &[u8],
) -> ApiResult<Response> {
    let template = evaluations::template(&state.seed, id)?;
    if !enabled(template) {
        return Err(invalid("Este exemplo não possui tramitação local."));
    }
    let input: Transition = parse(body)?;
    let note = if input.action == "return" {
        required(&input.observation, 3, 1000, "Motivo da devolução")?
    } else {
        input.observation.trim().to_owned()
    };
    if note.chars().count() > 1000 {
        return Err(invalid("A observação deve ter até 1000 caracteres."));
    }
    let mut db = state.db.lock().await;
    let tx = db.transaction().await?;
    let (_, stage) = lock_response(&tx, id).await?;
    let next = transition(stage, role, &input.action)?;
    let decision = match input.action.as_str() {
        "agree" => Some(true),
        "disagree" => Some(false),
        _ => None,
    };
    tx.execute("UPDATE demo_evaluation_responses SET workflow_stage=$2,finished=$3,agreement=$4,updated_at=now() WHERE evaluation_id=$1",&[&id,&next.name(),&(next!=Stage::Filling),&decision]).await?;
    event(&tx, id, role, &input.action, next.name(), &note).await?;
    notice(
        &tx,
        "requests",
        "Etapa da avaliação fictícia atualizada",
        next.label(),
        &format!("/governo-digital/servidor/contratos/DEMO-001?tab=avaliacoes&evaluation={id}"),
    )
    .await?;
    let result = evaluations::detail(&tx, &state.seed, id).await?;
    tx.commit().await?;
    Ok(ok(result))
}

fn attachment_type(filename: &str, body: &[u8]) -> ApiResult<(&'static str, String)> {
    let filename = required(filename, 1, 120, "Nome do arquivo")?;
    if filename
        .chars()
        .any(|c| c.is_control() || c == '/' || c == '\\')
    {
        return Err(invalid(
            "O nome do arquivo não pode conter caminhos ou controles.",
        ));
    }
    if body.is_empty() {
        return Err(invalid("O anexo não pode estar vazio."));
    }
    if body.len() > MAX_ATTACHMENT_BYTES {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Envie um arquivo não vazio com até 2 MiB.".into(),
        ));
    }
    let extension = filename
        .rsplit_once('.')
        .map(|(_, extension)| extension)
        .unwrap_or("")
        .to_ascii_lowercase();
    let media = match extension.as_str() {
        "pdf" if body.starts_with(b"%PDF-") => "application/pdf",
        "txt" if std::str::from_utf8(body).is_ok() && !body.contains(&0) => {
            "text/plain; charset=utf-8"
        }
        _ => {
            return Err(invalid(
                "Envie PDF com cabeçalho PDF ou TXT em UTF-8. Outros formatos não são aceitos.",
            ));
        }
    };
    Ok((media, filename))
}

pub(super) async fn upload(
    state: &AppState,
    id: &str,
    role: &str,
    filename: &str,
    body: &[u8],
) -> ApiResult<Response> {
    let template = evaluations::template(&state.seed, id)?;
    if role != "servidor" {
        return Err(forbidden_upload());
    }
    if template["status"] == "completed" || template["action"] != "questionnaire" {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Os anexos desta avaliação são somente para consulta.".into(),
        ));
    }
    let (media, filename) = attachment_type(filename, body)?;
    let mut db = state.db.lock().await;
    let tx = db.transaction().await?;
    let (finished, stage) = lock_response(&tx, id).await?;
    if if enabled(template) {
        stage != Stage::Filling
    } else {
        finished
    } {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Anexe arquivos apenas durante o preenchimento.".into(),
        ));
    }
    let count: i64 = tx
        .query_one(
            "SELECT COUNT(*) FROM demo_evaluation_attachments WHERE evaluation_id=$1",
            &[&id],
        )
        .await?
        .get(0);
    if count >= MAX_ATTACHMENTS {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Esta avaliação já possui cinco anexos.".into(),
        ));
    }
    let content = body.to_vec();
    let row=tx.query_one("INSERT INTO demo_evaluation_attachments(evaluation_id,filename,media_type,content,actor) VALUES($1,$2,$3,$4,$5) RETURNING id::text",&[&id,&filename,&media,&content,&role]).await?;
    let attachment_id: String = row.get(0);
    event(&tx, id, role, "attachment-added", stage.name(), &filename).await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id":attachment_id,"filename":filename,"bytes":body.len(),"mediaType":media})),
    )
        .into_response())
}

fn forbidden_upload() -> ApiError {
    ApiError(
        StatusCode::FORBIDDEN,
        "Anexos são enviados no papel Servidor da demonstração.".into(),
    )
}

pub(super) async fn download(
    db: &mut Client,
    seed: &Value,
    id: &str,
    attachment_id: &str,
    role: &str,
) -> ApiResult<Response> {
    evaluations::template(seed, id)?;
    let attachment_id = attachment_id
        .parse::<i64>()
        .ok()
        .filter(|id| *id > 0)
        .ok_or_else(missing)?;
    let tx = db.transaction().await?;
    let row=tx.query_opt("SELECT filename,media_type,content FROM demo_evaluation_attachments WHERE evaluation_id=$1 AND id=$2",&[&id,&attachment_id]).await?.ok_or_else(missing)?;
    let filename: String = row.get(0);
    let media: String = row.get(1);
    let bytes: Vec<u8> = row.get(2);
    let encoded = filename
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-._".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect::<String>();
    audit(
        &tx,
        role,
        "evaluation.attachment-downloaded",
        id,
        json!({"attachmentId":attachment_id}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        [
            (header::CONTENT_TYPE, media),
            (
                header::CONTENT_DISPOSITION,
                format!(
                    "attachment; filename=\"anexo.{}\"; filename*=UTF-8''{encoded}",
                    if filename.to_lowercase().ends_with(".pdf") {
                        "pdf"
                    } else {
                        "txt"
                    }
                ),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".into()),
            (header::CONTENT_SECURITY_POLICY, "sandbox".into()),
        ],
        bytes,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stage_and_roles_reject_skips_and_closed_transitions() {
        assert_eq!(
            transition(Stage::Review, "rh", "return").unwrap(),
            Stage::Filling
        );
        assert_eq!(
            transition(Stage::Review, "rh", "approve").unwrap(),
            Stage::Acknowledgment
        );
        assert_eq!(
            transition(Stage::Acknowledgment, "servidor", "disagree").unwrap(),
            Stage::Completed
        );
        assert_eq!(
            transition(Stage::Review, "servidor", "approve")
                .unwrap_err()
                .0,
            StatusCode::FORBIDDEN
        );
        assert!(transition(Stage::Filling, "rh", "approve").is_err());
        assert!(transition(Stage::Completed, "servidor", "agree").is_err());
        assert!(Stage::parse(Some("unknown")).is_err());
    }
    #[test]
    fn attachments_require_admitted_names_sizes_and_content() {
        assert_eq!(
            attachment_type("exemplo.PDF", b"%PDF-1.7\n").unwrap().0,
            "application/pdf"
        );
        assert!(attachment_type("anotação.txt", "Texto fictício".as_bytes()).is_ok());
        for (name, bytes) in [
            ("../fake.txt", &b"x"[..]),
            ("fake.pdf", &b"not-pdf"[..]),
            ("script.html", &b"<script>"[..]),
            ("fake.txt", &b"x\0"[..]),
            ("fake.txt", &b"\xff"[..]),
            ("fake\r.txt", &b"x"[..]),
            ("empty.txt", &b""[..]),
            ("txt", &b"text"[..]),
        ] {
            assert!(attachment_type(name, bytes).is_err(), "{name}");
        }
        assert!(attachment_type("large.txt", &vec![b'x'; MAX_ATTACHMENT_BYTES + 1]).is_err());
    }
}
