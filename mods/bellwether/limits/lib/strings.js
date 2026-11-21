// Token Rank: translations for the plan-limits view. Each row is the English
// text used in tr("…") followed by ko, ja, zh-Hans, zh-Hant, es, fr, de.
// Imported once from main.js for its side effect.
import { addStrings } from "../../lib/locale.js";

const LANGS = ["ko", "ja", "zh-Hans", "zh-Hant", "es", "fr", "de"];

const ROWS = [
  // windows (stored in English, translated in format.js windowLabel)
  ["{n}-hour", "{n}시간", "{n}時間", "{n}小时", "{n}小時", "{n} horas", "{n} heures", "{n} Stunden"],
  ["{n}h", "{n}시간", "{n}時間", "{n}小时", "{n}小時", "{n} h", "{n} h", "{n} Std."],
  ["Weekly", "주간", "週間", "每周", "每週", "Semanal", "Hebdomadaire", "Wöchentlich"],
  ["week", "주간", "週", "周", "週", "sem.", "sem.", "Woche"],
  ["Weekly · {scope}", "주간 · {scope}", "週間 · {scope}", "每周 · {scope}", "每週 · {scope}", "Semanal · {scope}", "Hebdomadaire · {scope}", "Wöchentlich · {scope}"],
  ["primary", "기본", "メイン", "主要", "主要", "principal", "principal", "primär"],
  ["secondary", "보조", "サブ", "次要", "次要", "secundario", "secondaire", "sekundär"],

  // time to reset
  ["<1m", "<1분", "<1分", "<1分钟", "<1分鐘", "<1 min", "<1 min", "<1 Min."],
  ["{d}d {h}h", "{d}일 {h}시간", "{d}日{h}時間", "{d}天{h}小时", "{d}天{h}小時", "{d} d {h} h", "{d} j {h} h", "{d} T. {h} Std."],
  ["{h}h {m}m", "{h}시간 {m}분", "{h}時間{m}分", "{h}小时{m}分", "{h}小時{m}分", "{h} h {m} min", "{h} h {m} min", "{h} Std. {m} Min."],
  ["{m}m", "{m}분", "{m}分", "{m}分钟", "{m}分鐘", "{m} min", "{m} min", "{m} Min."],

  // how long ago
  ["just now", "방금", "たった今", "刚刚", "剛剛", "ahora mismo", "à l'instant", "gerade eben"],
  ["{n} min ago", "{n}분 전", "{n}分前", "{n}分钟前", "{n}分鐘前", "hace {n} min", "il y a {n} min", "vor {n} Min."],
  ["{n} h ago", "{n}시간 전", "{n}時間前", "{n}小时前", "{n}小時前", "hace {n} h", "il y a {n} h", "vor {n} Std."],
  ["{n} d ago", "{n}일 전", "{n}日前", "{n}天前", "{n}天前", "hace {n} d", "il y a {n} j", "vor {n} T."],
  ["updated {ago}", "{ago} 업데이트", "{ago}更新", "{ago}更新", "{ago}更新", "actualizado {ago}", "mis à jour {ago}", "aktualisiert {ago}"],
  ["Last reading {ago}", "마지막 수치: {ago}", "最終取得: {ago}", "上次读取：{ago}", "上次讀取：{ago}", "Última lectura: {ago}", "Dernière lecture : {ago}", "Letzter Stand: {ago}"],

  // limits panel
  ["loading…", "불러오는 중…", "読み込み中…", "加载中…", "載入中…", "cargando…", "chargement…", "lädt…"],
  ["reset, waiting for a new reading", "초기화됐어요. 새 수치를 기다리고 있어요", "リセットされました。新しい値を待っています", "已重置，等待新的读数", "已重設，等待新的讀數", "reiniciado, esperando una nueva lectura", "réinitialisé, en attente d'une nouvelle lecture", "zurückgesetzt, warte auf neuen Stand"],
  [
    "Tick: {elapsed}% of the time has passed.\nYou've used {percent}%, so you're on pace.",
    "눈금: 기간의 {elapsed}%가 지났어요.\n{percent}%를 썼으니 알맞은 속도예요.",
    "目盛り: 期間の{elapsed}%が経過しました。\n{percent}%を使ったので、ちょうどよいペースです。",
    "刻度：时间已过去 {elapsed}%。\n已用 {percent}%，进度正好。",
    "刻度：時間已過去 {elapsed}%。\n已用 {percent}%，進度剛好。",
    "Marca: ha pasado el {elapsed} % del tiempo.\nUsado: {percent} %, al ritmo previsto.",
    "Repère : {elapsed} % du temps est écoulé.\n{percent} % utilisé : au rythme prévu.",
    "Markierung: {elapsed} % der Zeit sind vergangen.\n{percent} % verbraucht: im Plan.",
  ],
  [
    "Tick: {elapsed}% of the time has passed.\nYou've used {percent}%, so you're using it up too fast.",
    "눈금: 기간의 {elapsed}%가 지났어요.\n{percent}%를 썼으니 너무 빨리 쓰고 있어요.",
    "目盛り: 期間の{elapsed}%が経過しました。\n{percent}%を使ったので、使うペースが速すぎます。",
    "刻度：时间已过去 {elapsed}%。\n已用 {percent}%，用得太快了。",
    "刻度：時間已過去 {elapsed}%。\n已用 {percent}%，用得太快了。",
    "Marca: ha pasado el {elapsed} % del tiempo.\nUsado: {percent} %, se está gastando demasiado rápido.",
    "Repère : {elapsed} % du temps est écoulé.\n{percent} % utilisé : consommation trop rapide.",
    "Markierung: {elapsed} % der Zeit sind vergangen.\n{percent} % verbraucht: zu schneller Verbrauch.",
  ],
  [
    "Tick: {elapsed}% of the time has passed.\nYou've used {percent}%, so you have room to spare.",
    "눈금: 기간의 {elapsed}%가 지났어요.\n{percent}%를 썼으니 여유가 있어요.",
    "目盛り: 期間の{elapsed}%が経過しました。\n{percent}%を使ったので、まだ余裕があります。",
    "刻度：时间已过去 {elapsed}%。\n已用 {percent}%，还有余量。",
    "刻度：時間已過去 {elapsed}%。\n已用 {percent}%，還有餘裕。",
    "Marca: ha pasado el {elapsed} % del tiempo.\nUsado: {percent} %, queda margen de sobra.",
    "Repère : {elapsed} % du temps est écoulé.\n{percent} % utilisé : il reste de la marge.",
    "Markierung: {elapsed} % der Zeit sind vergangen.\n{percent} % verbraucht: noch reichlich Luft.",
  ],
  ["today", "오늘", "今日", "今天", "今天", "hoy", "aujourd'hui", "heute"],
  ["Tokens today / 7d", "오늘 / 7일 토큰", "今日 / 7日のトークン", "今天 / 7 天 Token", "今天 / 7 天 Token", "Tokens hoy / 7 d", "Tokens aujourd'hui / 7 j", "Tokens heute / 7 T"],
  ["Refreshing…", "새로고침 중…", "更新中…", "正在刷新…", "正在重新整理…", "Actualizando…", "Actualisation…", "Wird aktualisiert…"],
  ["Refresh now", "지금 새로고침", "今すぐ更新", "立即刷新", "立即重新整理", "Actualizar ahora", "Actualiser", "Jetzt aktualisieren"],
  ["Settings", "설정", "設定", "设置", "設定", "Ajustes", "Réglages", "Einstellungen"],

  // session
  ["This session", "이 세션", "このセッション", "当前会话", "目前工作階段", "Esta sesión", "Cette session", "Diese Sitzung"],
  ["{a} of {b}", "{b} 중 {a}", "{a} / {b}", "{a} / {b}", "{a} / {b}", "{a} de {b}", "{a} sur {b}", "{a} von {b}"],
  ["{n} call", "호출 {n}회", "呼び出し{n}回", "{n} 次调用", "{n} 次呼叫", "{n} llamada", "{n} appel", "{n} Aufruf"],
  ["{n} calls", "호출 {n}회", "呼び出し{n}回", "{n} 次调用", "{n} 次呼叫", "{n} llamadas", "{n} appels", "{n} Aufrufe"],
  ["{n} compaction", "압축 {n}회", "圧縮{n}回", "{n} 次压缩", "{n} 次壓縮", "{n} compactación", "{n} compaction", "{n} Komprimierung"],
  ["{n} compactions", "압축 {n}회", "圧縮{n}回", "{n} 次压缩", "{n} 次壓縮", "{n} compactaciones", "{n} compactions", "{n} Komprimierungen"],
  ["last: {trigger}, {pre} → {post}", "최근: {trigger}, {pre} → {post}", "前回: {trigger}、{pre} → {post}", "上次：{trigger}，{pre} → {post}", "上次：{trigger}，{pre} → {post}", "última: {trigger}, {pre} → {post}", "dernière : {trigger}, {pre} → {post}", "zuletzt: {trigger}, {pre} → {post}"],
  ["Cancel", "취소", "キャンセル", "取消", "取消", "Cancelar", "Annuler", "Abbrechen"],
  ["Choose Codex session…", "Codex 세션 선택…", "Codex セッションを選択…", "选择 Codex 会话…", "選擇 Codex 工作階段…", "Elegir sesión de Codex…", "Choisir la session Codex…", "Codex-Sitzung wählen…"],
  ["Change Codex session", "Codex 세션 바꾸기", "Codex セッションを変更", "更换 Codex 会话", "更換 Codex 工作階段", "Cambiar sesión de Codex", "Changer de session Codex", "Codex-Sitzung wechseln"],

  // settings
  ["Back to limits", "한도로 돌아가기", "上限に戻る", "返回限额", "返回限額", "Volver a los límites", "Retour aux limites", "Zurück zu den Limits"],
  ["Bar", "상태바", "ステータスバー", "状态栏", "狀態列", "Barra", "Barre", "Leiste"],
  ["Panel", "패널", "パネル", "面板", "面板", "Panel", "Panneau", "Panel"],
  ["Always show time to reset", "초기화까지 남은 시간 항상 표시", "リセットまでの時間を常に表示", "始终显示距重置的时间", "一律顯示距重設的時間", "Mostrar siempre el tiempo hasta el reinicio", "Toujours afficher le temps avant réinitialisation", "Zeit bis zum Zurücksetzen immer zeigen"],
  ["Show bars", "막대 표시", "メーターを表示", "显示进度条", "顯示進度條", "Mostrar barras", "Afficher les barres", "Balken anzeigen"],
  ["Context", "컨텍스트", "コンテキスト", "上下文", "上下文", "Contexto", "Contexte", "Kontext"],
  ["Calls", "호출", "呼び出し", "调用", "呼叫", "Llamadas", "Appels", "Aufrufe"],
  ["Compactions", "압축", "圧縮", "压缩", "壓縮", "Compactaciones", "Compactions", "Komprimierungen"],
  [
    "Data: claude, codex, opencode and pi, numbers from their session logs.",
    "데이터: claude, codex, opencode, pi. 수치는 각 세션 로그에서 가져와요.",
    "データ: claude、codex、opencode、pi。数値は各セッションログから取得します。",
    "数据：claude、codex、opencode 和 pi，数字取自它们的会话日志。",
    "資料：claude、codex、opencode 和 pi，數字取自它們的工作階段記錄。",
    "Datos: claude, codex, opencode y pi; cifras de sus registros de sesión.",
    "Données : claude, codex, opencode et pi, chiffres issus de leurs journaux de session.",
    "Daten: claude, codex, opencode und pi, Zahlen aus deren Sitzungsprotokollen.",
  ],
  ["not installed", "설치 안 됨", "未インストール", "未安装", "未安裝", "no instalado", "non installé", "nicht installiert"],
  ["no use in 7 days", "7일간 사용 없음", "7日間使用なし", "7 天内未使用", "7 天內未使用", "sin uso en 7 días", "inutilisé depuis 7 jours", "seit 7 Tagen ungenutzt"],

  // provider messages (stored in English, translated in format.js reportMessage)
  ["No reply from the claude CLI", "claude CLI가 응답하지 않아요", "claude CLI から応答がありません", "claude CLI 没有回应", "claude CLI 沒有回應", "Sin respuesta del CLI de claude", "Pas de réponse du CLI claude", "Keine Antwort von der claude-CLI"],
  ["claude CLI could not read usage", "claude CLI가 사용량을 읽지 못했어요", "claude CLI が使用量を読み取れませんでした", "claude CLI 无法读取用量", "claude CLI 無法讀取用量", "El CLI de claude no pudo leer el uso", "Le CLI claude n'a pas pu lire l'utilisation", "Die claude-CLI konnte die Nutzung nicht lesen"],
  ["No subscription limits", "구독 한도가 없어요", "サブスクリプションの上限はありません", "没有订阅限额", "沒有訂閱限額", "Sin límites de suscripción", "Aucune limite d'abonnement", "Keine Abo-Limits"],
  ["No limits in Codex reply", "Codex 응답에 한도가 없어요", "Codex の応答に上限がありません", "Codex 回应中没有限额", "Codex 回應中沒有限額", "La respuesta de Codex no trae límites", "Aucune limite dans la réponse de Codex", "Keine Limits in der Codex-Antwort"],
  ["Codex app-server didn't answer", "Codex app-server가 응답하지 않았어요", "Codex app-server が応答しませんでした", "Codex app-server 没有回应", "Codex app-server 沒有回應", "Codex app-server no respondió", "Codex app-server n'a pas répondu", "Codex app-server hat nicht geantwortet"],
  ["Codex error", "Codex 오류", "Codex エラー", "Codex 错误", "Codex 錯誤", "Error de Codex", "Erreur Codex", "Codex-Fehler"],
  ["No reply from Codex", "Codex가 응답하지 않아요", "Codex から応答がありません", "Codex 没有回应", "Codex 沒有回應", "Sin respuesta de Codex", "Pas de réponse de Codex", "Keine Antwort von Codex"],
  ["No stats from OpenCode", "OpenCode 통계가 없어요", "OpenCode の統計がありません", "没有 OpenCode 统计", "沒有 OpenCode 統計", "Sin estadísticas de OpenCode", "Aucune statistique d'OpenCode", "Keine Statistik von OpenCode"],
  ["Couldn't count {name} tokens", "{name} 토큰을 세지 못했어요", "{name} のトークンを数えられませんでした", "无法统计 {name} 的 Token", "無法統計 {name} 的 Token", "No se pudieron contar los tokens de {name}", "Impossible de compter les tokens de {name}", "{name}-Tokens konnten nicht gezählt werden"],
];

addStrings(Object.fromEntries(LANGS.map((code, i) => [code, Object.fromEntries(ROWS.map((row) => [row[0], row[i + 1]]))])));
