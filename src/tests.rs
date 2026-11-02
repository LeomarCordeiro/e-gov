use super::*;

#[test]
fn status_transitions_require_roles_and_a_reply() {
    assert!(!allowed_status("rh", "aberta", "concluida", false));
    assert!(!allowed_status("servidor", "aberta", "respondida", false));
    assert!(allowed_status("rh", "aberta", "em_analise", false));
    assert!(allowed_status("rh", "respondida", "concluida", true));
    assert!(allowed_status("servidor", "concluida", "aberta", true));
    assert!(!allowed_status("rh", "concluida", "aberta", true));
}

#[test]
fn input_boundaries_preserve_text_and_reject_unknown_context() {
    assert_eq!(required("  Férias  ", 3, 6, "Assunto").unwrap(), "Férias");
    assert!(required("   ", 3, 6, "Assunto").is_err());
    assert!(parse::<Message>(br#"{"body":"abc","unexpected":true}"#).is_err());
    assert!(context(&fixture(), "history", Some("missing")).is_err());
}

async fn call(state: &AppState, method: &str, path: &str, role: &str, body: Value) -> (u16, Value) {
    let req = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1:4173")
        .header("origin", "http://127.0.0.1:4173")
        .header("x-demo-role", role)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let response = handler(State(state.clone()), req).await;
    let status = response.status().as_u16();
    let bytes = to_bytes(response.into_body(), 2_000_000).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes))),
    )
}

// Uses the real PostgreSQL adapter in a fresh schema; never modifies the demo's public tables.
#[tokio::test]
#[ignore = "requires local PostgreSQL; run cargo test -- --ignored after setup-local.ps1"]
async fn postgres_api_workflow_and_persistence() {
    let url = config("DATABASE_URL").expect("run local setup first");
    let admin = connect(&url).await.unwrap();
    let schema = format!(
        "portal_test_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    admin
        .batch_execute(&format!("CREATE SCHEMA {schema}"))
        .await
        .unwrap();
    let test_schema = schema.clone();
    let result = tokio::spawn(async move {
        let db = connect(&url).await.unwrap();
        db.batch_execute(&format!("SET search_path TO {test_schema}")).await.unwrap();
        migrate(&db).await.unwrap();
        let mut state = AppState { db: Arc::new(Mutex::new(db)), seed: Arc::new(fixture()), root: PathBuf::from(env!("CARGO_MANIFEST_DIR")) };
        let empty = json!({});
        let (status, profile) = call(&state,"GET","/api/profile","servidor",empty.clone()).await;
        assert_eq!(status,200);assert_eq!(profile["name"],"Ana Silva");assert!(profile["email"].as_str().unwrap().ends_with(".invalid"));
        let (_, payments) = call(&state,"GET","/api/payments","servidor",empty.clone()).await;
        assert_eq!(values(&payments).len(),37);assert_eq!(payments[0]["id"],"2026-10-normal");
        for p in values(&payments) { let cents=|v:&Value|(v.as_f64().unwrap()*100.0).round() as i64;
            assert_eq!(cents(&p["gross"])-cents(&p["discounts"]),cents(&p["net"]));
            assert_eq!(values(&p["earnings"]).iter().map(|e|cents(&e["amount"])).sum::<i64>(),cents(&p["gross"]));
        }
        let (_, filtered)=call(&state,"GET","/api/payments?year=2026&month=9&kind=ferias","servidor",empty.clone()).await;
        assert_eq!(values(&filtered).len(),1);assert_eq!(filtered[0]["id"],"2026-09-ferias");
        for path in ["/api/payments?month=13","/api/payments?kind=unknown","/api/payments?year=bad"] {assert_eq!(call(&state,"GET",path,"servidor",empty.clone()).await.0,400);}
        assert_eq!(call(&state,"GET","/api/payments?year=2026&month=12","servidor",empty.clone()).await.1,json!([]));
        let (_,income)=call(&state,"GET","/api/income?year=2025","servidor",empty.clone()).await;
        let annual:Vec<_>=values(&payments).iter().filter(|p|p["year"]==2025).collect();
        assert_eq!(income["records"].as_u64().unwrap(),annual.len() as u64);assert_eq!(income["partial"],false);
        assert!((income["taxable"].as_f64().unwrap()-annual.iter().map(|p|p["gross"].as_f64().unwrap()).sum::<f64>()).abs()<0.01);
        assert_eq!(call(&state,"GET","/api/income?year=2000","servidor",empty.clone()).await.0,404);
        assert_eq!(call(&state,"GET","/api/income?year=2026","servidor",empty.clone()).await.1["partial"],true);
        for code in ["DEMO-202610-N-001","demo-ir-2025-001"] {assert_eq!(call(&state,"GET",&format!("/api/verify?code={code}"),"servidor",empty.clone()).await.1["valid"],true);}
        for code in ["arbitrary","","DEMO-EVENT-1"] {assert_eq!(call(&state,"GET",&format!("/api/verify?code={code}"),"servidor",empty.clone()).await.1["valid"],false);}
        let (_,catalog)=call(&state,"GET","/api/reports","servidor",empty.clone()).await;
        assert_eq!(values(&catalog).len(),1);assert_eq!(catalog[0]["name"],"Portal Servidor - Vida Funcional");
        let (status,report)=call(&state,"GET","/api/reports/functional-history","servidor",empty.clone()).await;
        assert_eq!(status,200);assert_eq!(report["person"]["registration"],"DEMO-001");assert_eq!(values(&report["events"]).len(),5);
        assert_eq!(report["events"][0]["document"]["availability"],"pending");assert!(report["events"][0]["document"].get("body").is_none());
        assert_eq!(call(&state,"GET","/api/reports/missing","servidor",empty.clone()).await.0,404);
        let mut unavailable=(*state.seed).clone();unavailable["reports"][0]["availability"]=json!("pending");
        let unavailable=AppState{seed:Arc::new(unavailable),..state.clone()};
        assert_eq!(call(&unavailable,"GET","/api/reports/functional-history","servidor",empty.clone()).await.0,409);
        assert_eq!(call(&state,"GET","/api/verify?code=DEMO-REPORT-HISTORY-001","servidor",empty.clone()).await.1["valid"],true);
        let (status,margin)=call(&state,"GET","/api/consignments","servidor",empty.clone()).await;
        assert_eq!(status,200);assert_eq!(margin["year"],2026);assert_eq!(margin["month"],10);assert_eq!(margin["data"]["margemDisponivel"],880);assert_eq!(values(&margin["periods"]).len(),3);
        let (_,margin)=call(&state,"GET","/api/consignments?year=2026&month=9","servidor",empty.clone()).await;
        assert_eq!(margin["data"]["consignadosExistentes"],json!({}));assert_eq!(margin["data"]["margemDisponivel"],1330);
        for period in ["year=2025&month=12","year=2020&month=1"] {assert_eq!(call(&state,"GET",&format!("/api/consignments?{period}"),"servidor",empty.clone()).await.1["data"],Value::Null);}
        for period in ["year=bad","month=13","month=0","year=3000"] {assert_eq!(call(&state,"GET",&format!("/api/consignments?{period}"),"servidor",empty.clone()).await.0,400);}
        let (_,docs)=call(&state,"GET","/api/documents","servidor",empty.clone()).await;
        assert_eq!(values(&docs).len(),45);assert_eq!(values(&docs).iter().map(|d|d["id"].as_str().unwrap()).collect::<std::collections::HashSet<_>>().len(),45);
        assert_eq!(values(&docs).iter().filter(|d|d["availability"]=="pending").count(),1);
        assert_eq!(call(&state,"GET","/api/history-documents/event-1","servidor",empty.clone()).await.0,409);
        let release=json!({"id":"history:event-1"});
        assert_eq!(call(&state,"POST","/api/demo/release-document","servidor",release.clone()).await.0,403);
        assert_eq!(call(&state,"POST","/api/demo/release-document","rh",release.clone()).await.1["changed"],true);
        assert_eq!(call(&state,"POST","/api/demo/release-document","rh",release).await.1["changed"],false);
        assert_eq!(call(&state,"GET","/api/verify?code=DEMO-EVENT-1","servidor",empty.clone()).await.1["valid"],true);
        assert_eq!(call(&state,"GET","/api/history-documents/event-1","servidor",empty.clone()).await.0,200);
        let request=json!({"title":"Dúvida sobre pagamento","category":"Pagamento","body":"Por que o valor mudou neste mês?","contextKind":"payment","contextId":"2026-10-normal"});
        let mut invalid=request.clone();invalid["contextId"]=json!("missing");
        assert_eq!(call(&state,"POST","/api/requests","servidor",invalid).await.0,404);
        assert_eq!(call(&state,"POST","/api/requests","rh",request.clone()).await.0,403);
        let (status,item)=call(&state,"POST","/api/requests","servidor",request.clone()).await;
        assert_eq!(status,201);assert_eq!(item["status"],"aberta");assert!(item["protocol"].as_str().unwrap().starts_with("ARQ-"));
        let path=format!("/api/requests/{}",item["id"].as_str().unwrap());
        assert_eq!(call(&state,"PATCH",&format!("{path}/status"),"rh",json!({"status":"concluida"})).await.0,409);
        assert_eq!(call(&state,"PATCH",&format!("{path}/status"),"rh",json!({"status":"em_analise"})).await.1["status"],"em_analise");
        assert_eq!(call(&state,"POST",&format!("{path}/messages"),"rh",json!({"body":"Resposta fictícia do RH."})).await.1["status"],"respondida");
        assert_eq!(call(&state,"PATCH",&format!("{path}/status"),"servidor",json!({"status":"concluida"})).await.1["status"],"concluida");
        assert_eq!(call(&state,"POST",&format!("{path}/messages"),"servidor",json!({"body":"Mais uma dúvida"})).await.0,409);
        assert_eq!(call(&state,"PATCH",&format!("{path}/status"),"servidor",json!({"status":"aberta"})).await.0,200);
        let (_,evaluations)=call(&state,"GET","/api/evaluations","servidor",empty.clone()).await;
        assert_eq!(values(&evaluations).len(),4);assert!(evaluations[0].get("questions").is_none());
        assert_eq!(call(&state,"GET","/api/evaluations/demo-eval-2","servidor",empty.clone()).await.1["readOnly"],true);
        assert_eq!(call(&state,"GET","/api/evaluations/missing","servidor",empty.clone()).await.0,404);
        let draft=json!({"answers":{"q1":{"optionId":"regular","observation":""}},"observation":"Rascunho fictício","finalize":false});
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-1/answers","servidor",draft.clone()).await.1["status"],"draft");
        let mut incomplete=draft.clone();incomplete["finalize"]=json!(true);
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-1/answers","servidor",incomplete).await.0,400);
        assert_eq!(call(&state,"GET","/api/evaluations/demo-eval-1","servidor",empty.clone()).await.1["status"],"draft");
        let completed=json!({"answers":{"q1":{"optionId":"regular","observation":""},"q2":{"optionId":"review","observation":"Explicação fictícia da resposta."}},"observation":"Teste local","finalize":true});
        let (status,saved)=call(&state,"POST","/api/evaluations/demo-eval-1/answers","servidor",completed).await;
        assert_eq!(status,200);assert_eq!(saved["status"],"completed");assert_eq!(saved["section"],"answered");assert_eq!(saved["score"],7.0);
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-1/answers","servidor",draft.clone()).await.0,409);
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-2/answers","servidor",draft.clone()).await.0,409);
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-4/answers","servidor",draft).await.0,400);
        let agreement=json!({"agree":false,"observation":"Ciência fictícia sem efeito funcional."});
        let (status,saved)=call(&state,"POST","/api/evaluations/demo-eval-4/agreement","servidor",agreement.clone()).await;
        assert_eq!(status,200);assert_eq!(saved["agreement"],false);assert_eq!(saved["status"],"completed");
        assert_eq!(call(&state,"POST","/api/evaluations/demo-eval-4/agreement","servidor",agreement).await.0,409);
        let (_,notices)=call(&state,"GET","/api/notifications","servidor",empty.clone()).await;
        assert_eq!(values(&notices["items"]).iter().filter(|n|n["category"]=="documents").count(),2);
        assert_eq!(call(&state,"PATCH","/api/preferences","servidor",json!({"documents":false,"requests":false})).await.0,200);
        assert_eq!(call(&state,"POST","/api/requests","servidor",request).await.0,201);
        assert_eq!(call(&state,"GET","/api/notifications","servidor",empty.clone()).await.1["items"],notices["items"]);
        assert_eq!(call(&state,"POST","/api/notifications/read","servidor",json!({"all":true})).await.0,200);
        let feedback=json!({"score":4,"page":"documents","submissionId":"fbcadaf1-84f6-441f-a36d-849b207e95a6"});
        assert_eq!(call(&state,"POST","/api/feedback","servidor",feedback.clone()).await.0,200);
        assert_eq!(call(&state,"POST","/api/feedback","servidor",feedback.clone()).await.0,200);
        let mut changed=feedback.clone();changed["score"]=json!(2);
        assert_eq!(call(&state,"POST","/api/feedback","servidor",changed).await.0,409);
        let mut bad=feedback.clone();bad["score"]=json!(6);
        assert_eq!(call(&state,"POST","/api/feedback","servidor",bad).await.0,400);
        let mut bad=feedback.clone();bad["page"]=json!("unknown");
        assert_eq!(call(&state,"POST","/api/feedback","servidor",bad).await.0,400);
        let mut bad=feedback;bad["submissionId"]=json!("------------------------------------");
        assert_eq!(call(&state,"POST","/api/feedback","servidor",bad).await.0,400);
        assert_eq!(call(&state,"GET","/api/feedback/summary","servidor",empty.clone()).await.0,403);
        let (_,summary)=call(&state,"GET","/api/feedback/summary","rh",empty.clone()).await;
        assert_eq!(summary["count"],1);assert_eq!(summary["average"],4.0);assert_eq!(summary["scores"]["4"],1);
        // Reconnect and rerun migrations: persistence and seed idempotency across restarts.
        let db=connect(&url).await.unwrap();db.batch_execute(&format!("SET search_path TO {test_schema}")).await.unwrap();migrate(&db).await.unwrap();
        state.db=Arc::new(Mutex::new(db));
        assert_eq!(call(&state,"GET","/api/feedback/summary","rh",empty.clone()).await.1["count"],1);
        assert_eq!(call(&state,"GET","/api/evaluations/demo-eval-1","servidor",empty.clone()).await.1["status"],"completed");
        assert_eq!(call(&state,"GET","/api/evaluations/demo-eval-4","servidor",empty.clone()).await.1["agreement"],false);
        let (_,saved)=call(&state,"GET",&path,"servidor",empty.clone()).await;
        assert_eq!(saved["messages"].as_array().unwrap().len(),2);assert_eq!(saved["events"].as_array().unwrap().len(),5);
        assert_eq!(call(&state,"GET","/api/notifications","servidor",empty.clone()).await.1["unread"],0);
        assert_eq!(call(&state,"GET","/api/preferences","servidor",empty.clone()).await.1["requests"],false);
        assert_eq!(call(&state,"GET","/api/history-documents/event-1","servidor",empty.clone()).await.0,200);
        assert_eq!(call(&state,"GET","/api/audit","servidor",empty.clone()).await.0,403);
        assert!(!values(&call(&state,"GET","/api/audit","rh",empty.clone()).await.1).is_empty());
        for path in ["/", "/governo-digital/servidor/solicitacoes", "/governo-digital/servidor/avisos", "/governo-digital/servidor/documentos", "/governo-digital/servidor/contratos/DEMO-001?tab=relatorios", "/governo-digital/servidor/contratos/DEMO-001?tab=consignacao", "/governo-digital/oxy/validar-autenticacao-relatorios", "/app.js", "/workflow-ui.js", "/workflow.css", "/feedback.js", "/feedback.css", "/contract-ui.js", "/contract.css", "/evaluations-ui.js", "/evaluations.css", "/document-export.js", "/accessibility.js", "/delivery-ui.js", "/assets/arquimetria-colorida.svg", "/assets/arquimetria-monocromatica.svg", "/assets/arquimetria-icone.svg"] {assert_eq!(call(&state,"GET",path,"servidor",empty.clone()).await.0,200,"{path}");}
        for path in ["/.env","/data/demo.json","/evidence/portal-initial.json","/.browser-profile/Local%20State","/assets/..%2f.env"] {assert_eq!(call(&state,"GET",path,"servidor",empty.clone()).await.0,404,"{path}");}
        let req=Request::builder().method("POST").uri("/api/requests").header("host","127.0.0.1:4173").header("origin","https://example.invalid").header("content-type","application/json").body(Body::from("{}")).unwrap();
        assert_eq!(handler(State(state.clone()),req).await.status(),StatusCode::FORBIDDEN);
        assert_eq!(call(&state,"POST","/api/profile","servidor",empty).await.0,405);
    }).await;
    admin
        .batch_execute(&format!("DROP SCHEMA {schema} CASCADE"))
        .await
        .unwrap();
    result.unwrap();
}
