use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{Request, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
use tokio_postgres::{Client, GenericClient, NoTls};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Client>>,
    seed: Arc<Value>,
    root: PathBuf,
}
#[derive(Debug)]
struct ApiError(StatusCode, String);
type ApiResult<T> = Result<T, ApiError>;
impl From<tokio_postgres::Error> for ApiError {
    fn from(e: tokio_postgres::Error) -> Self {
        eprintln!("database operation: {e}");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Não foi possível concluir a operação no banco local. Tente novamente.".into(),
        )
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
fn invalid(message: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, message.into())
}
fn missing() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "Registro não encontrado.".into())
}
fn forbidden() -> ApiError {
    ApiError(
        StatusCode::FORBIDDEN,
        "Esta ação está disponível apenas no modo RH da demonstração.".into(),
    )
}
fn required(value: &str, min: usize, max: usize, label: &str) -> ApiResult<String> {
    let s = value.trim();
    if s.chars().count() < min || s.chars().count() > max {
        return Err(invalid(&format!(
            "{label} deve ter entre {min} e {max} caracteres."
        )));
    }
    Ok(s.to_owned())
}
fn values(v: &Value) -> &Vec<Value> {
    v.as_array().expect("bundled demo fixture must be an array")
}
fn fixture() -> Value {
    serde_json::from_str(include_str!("../data/demo.json")).expect("valid bundled fixture")
}

fn config(key: &str) -> Option<String> {
    std::env::var(key).ok().or_else(|| {
        std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".env"))
            .ok()?
            .lines()
            .find_map(|line| {
                line.strip_prefix(&format!("{key}="))
                    .map(|v| v.trim().to_owned())
            })
    })
}
async fn connect(url: &str) -> Result<Client, tokio_postgres::Error> {
    let (client, connection) = tokio_postgres::connect(url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection ended: {e}");
        }
    });
    Ok(client)
}
async fn migrate(db: &Client) -> Result<(), tokio_postgres::Error> {
    db.batch_execute(include_str!("../migrations/001_portal.sql"))
        .await?;
    db.execute("INSERT INTO portal_notifications(category,title,body,url,dedupe_key) VALUES ('documents','Holerite de outubro disponível','Documento fictício pronto para consulta.','/governo-digital/servidor/contratos/DEMO-001?tab=holerites&abrir=2026-10-normal','seed:payment:2026-10-normal') ON CONFLICT DO NOTHING",&[]).await?;
    Ok(())
}
async fn audit<C: GenericClient + Sync>(
    db: &C,
    actor: &str,
    action: &str,
    resource: &str,
    details: Value,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO portal_audit(actor,action,resource,details) VALUES($1,$2,$3,$4)",
        &[&actor, &action, &resource, &details],
    )
    .await?;
    Ok(())
}
async fn notice<C: GenericClient + Sync>(
    db: &C,
    category: &str,
    title: &str,
    body: &str,
    url: &str,
) -> ApiResult<()> {
    db.execute("INSERT INTO portal_notifications(category,title,body,url) SELECT $1,$2,$3,$4 FROM portal_preferences WHERE id=1 AND CASE WHEN $1='documents' THEN documents ELSE requests END",&[&category,&title,&body,&url]).await?;
    Ok(())
}
async fn preferences<C: GenericClient + Sync>(db: &C) -> ApiResult<Value> {
    Ok(db.query_one("SELECT jsonb_build_object('documents',documents,'requests',requests) FROM portal_preferences WHERE id=1",&[]).await?.get(0))
}
async fn documents<C: GenericClient + Sync>(db: &C, seed: &Value) -> ApiResult<Vec<Value>> {
    let releases: Vec<String> = db
        .query("SELECT document_id FROM document_releases", &[])
        .await?
        .iter()
        .map(|r| r.get(0))
        .collect();
    let mut docs = vec![];
    for p in values(&seed["payments"]) {
        docs.push(json!({"id":format!("payment:{}",p["id"].as_str().unwrap()),"kind":"payment","year":p["year"],"month":p["month"],"title":format!("Holerite — {}",p["type"].as_str().unwrap()),"period":format!("{:02}/{}",p["month"].as_u64().unwrap(),p["year"]),"paymentId":p["id"],"code":p["verificationCode"],"partial":false,"availability":"available"}));
    }
    for i in values(&seed["incomes"]) {
        docs.push(json!({"id":format!("income:{}",i["year"]),"kind":"income","year":i["year"],"month":null,"title":"Comprovante de Rendimento","period":i["year"].to_string(),"code":i["verificationCode"],"partial":i["partial"],"availability":"available"}));
    }
    for e in values(&seed["history"]) {
        let mut d = e["document"].clone();
        d.as_object_mut().unwrap().remove("body");
        if releases
            .iter()
            .any(|id| Some(id.as_str()) == d["id"].as_str())
        {
            d["availability"] = json!("available");
            d["reason"] = json!("");
        }
        docs.push(d);
    }
    docs.sort_by(|a, b| {
        b["year"].as_i64().cmp(&a["year"].as_i64()).then(
            b["month"]
                .as_i64()
                .unwrap_or(13)
                .cmp(&a["month"].as_i64().unwrap_or(13)),
        )
    });
    Ok(docs)
}
fn context(seed: &Value, kind: &str, id: Option<&str>) -> ApiResult<String> {
    match kind {
        "general" => Ok("Dúvida geral".into()),
        "payment" => values(&seed["payments"])
            .iter()
            .find(|p| p["id"].as_str() == id)
            .map(|p| {
                format!(
                    "Holerite {:02}/{} — {}",
                    p["month"].as_u64().unwrap(),
                    p["year"],
                    p["type"].as_str().unwrap()
                )
            })
            .ok_or_else(missing),
        "history" => values(&seed["history"])
            .iter()
            .find(|p| p["id"].as_str() == id)
            .map(|p| p["title"].as_str().unwrap().to_owned())
            .ok_or_else(missing),
        _ => Err(invalid("Vínculo da solicitação inválido.")),
    }
}
const REQUEST_JSON: &str = "jsonb_build_object('id',id::text,'protocol',protocol,'title',title,'category',category,'contextKind',context_kind,'contextId',context_id,'contextLabel',context_label,'status',status,'createdAt',created_at,'updatedAt',updated_at)";
async fn request_detail<C: GenericClient + Sync>(db: &C, id: i64) -> ApiResult<Value> {
    let row = db
        .query_opt(
            &format!("SELECT {REQUEST_JSON} FROM rh_requests WHERE id=$1"),
            &[&id],
        )
        .await?
        .ok_or_else(missing)?;
    let mut item: Value = row.get(0);
    item["messages"]=json!(db.query("SELECT jsonb_build_object('id',id::text,'author',author,'body',body,'createdAt',created_at) FROM rh_messages WHERE request_id=$1 ORDER BY id",&[&id]).await?.iter().map(|r|r.get::<_,Value>(0)).collect::<Vec<_>>());
    item["events"]=json!(db.query("SELECT jsonb_build_object('actor',actor,'action',action,'status',status,'createdAt',created_at) FROM rh_request_events WHERE request_id=$1 ORDER BY id",&[&id]).await?.iter().map(|r|r.get::<_,Value>(0)).collect::<Vec<_>>());
    Ok(item)
}
async fn event<C: GenericClient + Sync>(
    db: &C,
    id: i64,
    role: &str,
    action: &str,
    status: &str,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO rh_request_events(request_id,actor,action,status) VALUES($1,$2,$3,$4)",
        &[&id, &role, &action, &status],
    )
    .await?;
    audit(
        db,
        role,
        action,
        &format!("request:{id}"),
        json!({"status":status}),
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewRequest {
    title: String,
    category: String,
    body: String,
    context_kind: String,
    context_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Message {
    body: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusChange {
    status: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PreferenceChange {
    documents: bool,
    requests: bool,
}
fn parse<T: serde::de::DeserializeOwned>(body: &[u8]) -> ApiResult<T> {
    serde_json::from_slice(body)
        .map_err(|_| invalid("Dados inválidos. Confira os campos do formulário."))
}
fn allowed_status(role: &str, old: &str, new: &str, has_reply: bool) -> bool {
    match (role, old, new) {
        ("rh", "aberta" | "respondida", "em_analise") => true,
        ("rh", s, "concluida") if s != "concluida" && has_reply => true,
        ("servidor", "respondida", "concluida") => true,
        ("servidor", "concluida" | "respondida", "aberta") => true,
        _ => false,
    }
}
fn ok(v: Value) -> Response {
    Json(v).into_response()
}

async fn api(
    state: &AppState,
    method: &str,
    path: &str,
    query: &str,
    role: &str,
    body: &[u8],
) -> ApiResult<Response> {
    let params: std::collections::HashMap<String, String> = axum::extract::Query::try_from_uri(
        &format!("/?{query}")
            .parse()
            .map_err(|_| invalid("Consulta inválida."))?,
    )
    .map_err(|_| invalid("Consulta inválida."))?
    .0;
    let seed = &state.seed;
    if method == "GET" {
        match path {
            "/api/health" => {
                let db = state.db.lock().await;
                db.query_one("SELECT 1", &[]).await?;
                return Ok(ok(
                    json!({"status":"ok","backend":"Rust","database":"PostgreSQL","mode":"local-demo"}),
                ));
            }
            "/api/profile" => return Ok(ok(seed["person"].clone())),
            "/api/payments" => {
                let year = params
                    .get("year")
                    .filter(|s| !s.is_empty())
                    .map(|s| s.parse::<i64>())
                    .transpose()
                    .map_err(|_| invalid("Ano inválido."))?;
                let month = params
                    .get("month")
                    .filter(|s| !s.is_empty())
                    .map(|s| s.parse::<i64>())
                    .transpose()
                    .map_err(|_| invalid("Mês inválido."))?;
                let kind = params.get("kind").filter(|s| !s.is_empty());
                if month.is_some_and(|m| !(1..=12).contains(&m))
                    || kind.is_some_and(|k| !matches!(k.as_str(), "normal" | "ferias"))
                {
                    return Err(invalid("Filtro inválido."));
                }
                return Ok(ok(json!(
                    values(&seed["payments"])
                        .iter()
                        .filter(|p| year.is_none_or(|v| p["year"] == v)
                            && month.is_none_or(|v| p["month"] == v)
                            && kind.is_none_or(|v| p["kind"] == v.as_str()))
                        .collect::<Vec<_>>()
                )));
            }
            "/api/income" => {
                let year = params.get("year").and_then(|s| s.parse::<i64>().ok());
                return Ok(ok(values(&seed["incomes"])
                    .iter()
                    .find(|p| p["year"].as_i64() == year)
                    .ok_or_else(missing)?
                    .clone()));
            }
            "/api/verify" => {
                let code = params
                    .get("code")
                    .map(|s| s.trim().to_uppercase())
                    .unwrap_or_default();
                for p in values(&seed["payments"]) {
                    if p["verificationCode"] == code {
                        return Ok(ok(
                            json!({"valid":true,"kind":"Holerite","code":code,"person":seed["person"]["name"],"period":format!("{:02}/{}",p["month"].as_u64().unwrap(),p["year"]),"amount":p["net"]}),
                        ));
                    }
                }
                for i in values(&seed["incomes"]) {
                    if i["verificationCode"] == code {
                        return Ok(ok(
                            json!({"valid":true,"kind":"Comprovante de Rendimento","code":code,"person":seed["person"]["name"],"period":i["year"].to_string()}),
                        ));
                    }
                }
                let db = state.db.lock().await;
                for d in documents(&*db, seed).await? {
                    if d["kind"] == "history"
                        && d["code"] == code
                        && d["availability"] == "available"
                    {
                        return Ok(ok(
                            json!({"valid":true,"kind":"Documento funcional","code":code,"person":seed["person"]["name"],"period":d["period"]}),
                        ));
                    }
                }
                return Ok(ok(
                    json!({"valid":false,"code":code,"message":"Código não encontrado nesta demonstração."}),
                ));
            }
            _ => {}
        }
        if let Some(id) = path.strip_prefix("/api/payments/") {
            let p = values(&seed["payments"])
                .iter()
                .find(|p| p["id"] == id)
                .ok_or_else(missing)?;
            return Ok(ok(p.clone()));
        }
    }
    let mut db = state.db.lock().await;
    if method == "GET" {
        match path {
            "/api/documents" => return Ok(ok(json!(documents(&*db, seed).await?))),
            "/api/history" => {
                let docs = documents(&*db, seed).await?;
                let events: Vec<_> = values(&seed["history"])
                    .iter()
                    .map(|e| {
                        let mut event = e.clone();
                        event["document"] = docs
                            .iter()
                            .find(|d| d["id"] == e["document"]["id"])
                            .unwrap()
                            .clone();
                        event
                    })
                    .collect();
                return Ok(ok(json!(events)));
            }
            "/api/preferences" => return Ok(ok(preferences(&*db).await?)),
            "/api/requests" => {
                let rows=db.query(&format!("SELECT {REQUEST_JSON} FROM rh_requests ORDER BY updated_at DESC,id DESC"),&[]).await?;
                return Ok(ok(json!(
                    rows.iter()
                        .map(|r| r.get::<_, Value>(0))
                        .collect::<Vec<_>>()
                )));
            }
            "/api/notifications" => {
                let rows=db.query("SELECT jsonb_build_object('id',id::text,'category',category,'title',title,'body',body,'url',url,'read',read_at IS NOT NULL,'createdAt',created_at) FROM portal_notifications ORDER BY id DESC",&[]).await?;
                let items: Vec<Value> = rows.iter().map(|r| r.get(0)).collect();
                let unread = items.iter().filter(|i| i["read"] == false).count();
                return Ok(ok(json!({"items":items,"unread":unread})));
            }
            "/api/audit" => {
                if role != "rh" {
                    return Err(forbidden());
                }
                let rows=db.query("SELECT jsonb_build_object('actor',actor,'action',action,'resource',resource,'details',details,'createdAt',created_at) FROM portal_audit ORDER BY id DESC LIMIT 100",&[]).await?;
                return Ok(ok(json!(
                    rows.iter()
                        .map(|r| r.get::<_, Value>(0))
                        .collect::<Vec<_>>()
                )));
            }
            _ => {}
        }
        if let Some(id) = path.strip_prefix("/api/requests/") {
            let id = id.parse::<i64>().map_err(|_| missing())?;
            return Ok(ok(request_detail(&*db, id).await?));
        }
        if let Some(id) = path.strip_prefix("/api/history-documents/") {
            let e = values(&seed["history"])
                .iter()
                .find(|e| e["id"] == id)
                .ok_or_else(missing)?;
            let docs = documents(&*db, seed).await?;
            let d = docs
                .iter()
                .find(|d| d["id"] == e["document"]["id"])
                .ok_or_else(missing)?;
            if d["availability"] == "pending" {
                return Err(ApiError(
                    StatusCode::CONFLICT,
                    d["reason"].as_str().unwrap().into(),
                ));
            }
            audit(
                &*db,
                role,
                "document.view",
                d["id"].as_str().unwrap(),
                json!({}),
            )
            .await?;
            let mut d = d.clone();
            d["body"] = e["document"]["body"].clone();
            return Ok(ok(d));
        }
        return Err(missing());
    }
    if method == "POST" && path == "/api/requests" {
        if role != "servidor" {
            return Err(ApiError(
                StatusCode::FORBIDDEN,
                "Abra solicitações no modo Servidor da demonstração.".into(),
            ));
        }
        let input: NewRequest = parse(body)?;
        let title = required(&input.title, 4, 120, "Assunto")?;
        let message = required(&input.body, 10, 4000, "Descrição")?;
        if !["Pagamento", "Vida funcional", "Documentos", "Outros"]
            .contains(&input.category.as_str())
        {
            return Err(invalid("Categoria inválida."));
        }
        let label = context(seed, &input.context_kind, input.context_id.as_deref())?;
        let tx = db.transaction().await?;
        let id: i64 = tx
            .query_one(
                "SELECT nextval(pg_get_serial_sequence('rh_requests','id'))",
                &[],
            )
            .await?
            .get(0);
        let year: i32 = tx
            .query_one(
                "SELECT extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int",
                &[],
            )
            .await?
            .get(0);
        let protocol = format!("ARQ-{year}-{id:06}");
        tx.execute("INSERT INTO rh_requests(id,protocol,title,category,context_kind,context_id,context_label) VALUES($1,$2,$3,$4,$5,$6,$7)",&[&id,&protocol,&title,&input.category,&input.context_kind,&input.context_id,&label]).await?;
        tx.execute(
            "INSERT INTO rh_messages(request_id,author,body) VALUES($1,'servidor',$2)",
            &[&id, &message],
        )
        .await?;
        event(&tx, id, role, "request.created", "aberta").await?;
        notice(
            &tx,
            "requests",
            &format!("Solicitação {protocol} registrada"),
            "Acompanhe o protocolo no atendimento local.",
            &format!("/governo-digital/servidor/solicitacoes?request={id}"),
        )
        .await?;
        let result = request_detail(&tx, id).await?;
        tx.commit().await?;
        return Ok((StatusCode::CREATED, Json(result)).into_response());
    }
    if let Some(tail) = path.strip_prefix("/api/requests/")
        && let Some((id, action)) = tail.split_once('/')
    {
        let id = id.parse::<i64>().map_err(|_| missing())?;
        if method == "POST" && action == "messages" {
            let input: Message = parse(body)?;
            let message = required(&input.body, 3, 4000, "Mensagem")?;
            let tx = db.transaction().await?;
            let row = tx
                .query_opt(
                    "SELECT status,protocol FROM rh_requests WHERE id=$1 FOR UPDATE",
                    &[&id],
                )
                .await?
                .ok_or_else(missing)?;
            let old: String = row.get(0);
            let protocol: String = row.get(1);
            if old == "concluida" {
                return Err(ApiError(
                    StatusCode::CONFLICT,
                    "Reabra a solicitação antes de enviar outra mensagem.".into(),
                ));
            }
            let next = if role == "rh" {
                "respondida"
            } else if old == "respondida" {
                "em_analise"
            } else {
                &old
            };
            tx.execute(
                "INSERT INTO rh_messages(request_id,author,body) VALUES($1,$2,$3)",
                &[&id, &role, &message],
            )
            .await?;
            tx.execute(
                "UPDATE rh_requests SET status=$2,updated_at=now() WHERE id=$1",
                &[&id, &next],
            )
            .await?;
            event(
                &tx,
                id,
                role,
                if role == "rh" {
                    "request.replied"
                } else {
                    "request.message"
                },
                next,
            )
            .await?;
            if role == "rh" {
                notice(
                    &tx,
                    "requests",
                    &format!("Resposta em {protocol}"),
                    "O RH da demonstração respondeu. Abra o protocolo para ler.",
                    &format!("/governo-digital/servidor/solicitacoes?request={id}"),
                )
                .await?;
            }
            let result = request_detail(&tx, id).await?;
            tx.commit().await?;
            return Ok(ok(result));
        }
        if method == "PATCH" && action == "status" {
            let input: StatusChange = parse(body)?;
            let tx = db.transaction().await?;
            let row = tx
                .query_opt(
                    "SELECT status,protocol FROM rh_requests WHERE id=$1 FOR UPDATE",
                    &[&id],
                )
                .await?
                .ok_or_else(missing)?;
            let old: String = row.get(0);
            let protocol: String = row.get(1);
            let replied: bool = tx
                .query_one(
                    "SELECT EXISTS(SELECT 1 FROM rh_messages WHERE request_id=$1 AND author='rh')",
                    &[&id],
                )
                .await?
                .get(0);
            if !allowed_status(role, &old, &input.status, replied) {
                return Err(ApiError(StatusCode::CONFLICT,"Mudança de situação não permitida. É necessária uma resposta antes da conclusão.".into()));
            }
            tx.execute(
                "UPDATE rh_requests SET status=$2,updated_at=now() WHERE id=$1",
                &[&id, &input.status],
            )
            .await?;
            event(&tx, id, role, "request.status", &input.status).await?;
            notice(
                &tx,
                "requests",
                &format!("Andamento de {protocol}"),
                &format!("Situação atualizada: {}.", input.status),
                &format!("/governo-digital/servidor/solicitacoes?request={id}"),
            )
            .await?;
            let result = request_detail(&tx, id).await?;
            tx.commit().await?;
            return Ok(ok(result));
        }
    }
    if method == "PATCH" && path == "/api/preferences" {
        let input: PreferenceChange = parse(body)?;
        let tx = db.transaction().await?;
        tx.execute(
            "UPDATE portal_preferences SET documents=$1,requests=$2 WHERE id=1",
            &[&input.documents, &input.requests],
        )
        .await?;
        audit(
            &tx,
            role,
            "preferences.updated",
            "notifications",
            json!({"documents":input.documents,"requests":input.requests}),
        )
        .await?;
        let result = preferences(&tx).await?;
        tx.commit().await?;
        return Ok(ok(result));
    }
    if method == "POST" && path == "/api/notifications/read" {
        let input: Value = parse(body)?;
        let tx = db.transaction().await?;
        if input["all"] == true {
            tx.execute(
                "UPDATE portal_notifications SET read_at=now() WHERE read_at IS NULL",
                &[],
            )
            .await?;
        } else {
            let id = input["id"]
                .as_str()
                .and_then(|v| v.parse::<i64>().ok())
                .ok_or_else(|| invalid("Aviso inválido."))?;
            if tx
                .execute(
                    "UPDATE portal_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1",
                    &[&id],
                )
                .await?
                == 0
            {
                return Err(missing());
            }
        }
        audit(&tx, role, "notifications.read", "notifications", json!({})).await?;
        tx.commit().await?;
        return Ok(ok(json!({"ok":true})));
    }
    if method == "POST" && path == "/api/demo/release-document" {
        if role != "rh" {
            return Err(forbidden());
        }
        let input: Value = parse(body)?;
        let id = input["id"]
            .as_str()
            .ok_or_else(|| invalid("Documento inválido."))?;
        let e = values(&seed["history"])
            .iter()
            .find(|e| e["document"]["id"] == id)
            .ok_or_else(missing)?;
        if e["document"]["availability"] != "pending" {
            return Ok(ok(json!({"ok":true,"changed":false})));
        }
        let tx = db.transaction().await?;
        let count = tx
            .execute(
                "INSERT INTO document_releases(document_id) VALUES($1) ON CONFLICT DO NOTHING",
                &[&id],
            )
            .await?;
        if count > 0 {
            audit(&tx, role, "document.released", id, json!({})).await?;
            notice(
                &tx,
                "documents",
                "Documento funcional liberado",
                e["document"]["title"].as_str().unwrap(),
                "/governo-digital/servidor/documentos",
            )
            .await?;
        }
        tx.commit().await?;
        return Ok(ok(json!({"ok":true,"changed":count>0})));
    }
    Err(ApiError(
        StatusCode::METHOD_NOT_ALLOWED,
        "Método não permitido para este recurso.".into(),
    ))
}

async fn dispatch(state: AppState, req: Request<Body>) -> ApiResult<Response> {
    let path = req.uri().path().to_owned();
    let query = req.uri().query().unwrap_or("").to_owned();
    let method = req.method().as_str().to_owned();
    let role = req
        .headers()
        .get("x-demo-role")
        .and_then(|s| s.to_str().ok())
        .unwrap_or("servidor")
        .to_owned();
    if !["servidor", "rh"].contains(&role.as_str()) {
        return Err(invalid("Modo de demonstração inválido."));
    }
    if path.starts_with("/api/") {
        if !["GET", "HEAD"].contains(&method.as_str()) {
            let host = req
                .headers()
                .get(header::HOST)
                .and_then(|h| h.to_str().ok())
                .unwrap_or("");
            if let Some(origin) = req.headers().get(header::ORIGIN)
                && origin.to_str().unwrap_or("") != format!("http://{host}")
            {
                return Err(ApiError(
                    StatusCode::FORBIDDEN,
                    "Origem da operação não permitida.".into(),
                ));
            }
            if !req
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|h| h.to_str().ok())
                .is_some_and(|h| h.starts_with("application/json"))
            {
                return Err(invalid("Envie os dados como JSON."));
            }
        }
        let bytes = to_bytes(req.into_body(), 65536)
            .await
            .map_err(|_| invalid("Solicitação muito grande."))?;
        let mut response = api(
            &state,
            if method == "HEAD" { "GET" } else { &method },
            &path,
            &query,
            &role,
            &bytes,
        )
        .await?;
        if method == "HEAD" {
            *response.body_mut() = Body::empty();
        }
        return Ok(response);
    }
    if method != "GET" && method != "HEAD" {
        return Err(ApiError(
            StatusCode::METHOD_NOT_ALLOWED,
            "Método não permitido.".into(),
        ));
    }
    let file = if path == "/"
        || path == "/governo-digital/servidor"
        || path.starts_with("/governo-digital/servidor/")
        || path == "/governo-digital/oxy/validar-autenticacao-relatorios"
    {
        "index.html".to_owned()
    } else if [
        "/app.js",
        "/delivery.js",
        "/delivery-ui.js",
        "/workflow-ui.js",
        "/zip.js",
        "/styles.css",
        "/delivery.css",
        "/workflow.css",
    ]
    .contains(&path.as_str())
    {
        path[1..].to_owned()
    } else if let Some(name) = path.strip_prefix("/assets/") {
        if name.is_empty()
            || !name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        {
            return Err(missing());
        }
        format!("public-assets/{name}")
    } else {
        return Err(missing());
    };
    let content = tokio::fs::read(state.root.join(&file))
        .await
        .map_err(|_| missing())?;
    let mime = match file.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    };
    Ok((
        [(header::CONTENT_TYPE, mime)],
        if method == "HEAD" { vec![] } else { content },
    )
        .into_response())
}
async fn handler(State(state): State<AppState>, req: Request<Body>) -> Response {
    let mut response = match dispatch(state, req).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "no-referrer".parse().unwrap());
    response.headers_mut().insert("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'".parse().unwrap());
    response
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = config("DATABASE_URL")
        .ok_or("Execute scripts/setup-local.ps1 para preparar o PostgreSQL e o arquivo .env.")?;
    let db = connect(&url).await?;
    migrate(&db).await?;
    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        seed: Arc::new(fixture()),
        root: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
    };
    let port = config("PORT")
        .unwrap_or_else(|| "4173".into())
        .parse::<u16>()?;
    let app = Router::new()
        .route("/", get(handler))
        .fallback(handler)
        .with_state(state);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!(
        "ArquimetrIA • Rust + PostgreSQL\nPortal local: http://127.0.0.1:{port}/governo-digital/servidor\nDemonstração com dados fictícios. Nenhuma mensagem é enviada à prefeitura."
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
