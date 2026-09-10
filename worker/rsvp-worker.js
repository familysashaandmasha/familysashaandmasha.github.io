/**
 * RSVP → Telegram.
 *
 * Зачем нужен: токен бота нельзя класть во фронтенд, его увидит любой гость.
 * Воркер — тонкая прослойка, которая держит токен у себя.
 *
 * Развертывание (5 минут, бесплатный тариф):
 *   1. Создать бота у @BotFather, забрать токен.
 *   2. Написать боту любое сообщение, затем открыть
 *      https://api.telegram.org/bot<ТОКЕН>/getUpdates и взять оттуда chat.id.
 *   3. npm i -g wrangler && wrangler login
 *   4. wrangler deploy
 *   5. wrangler secret put BOT_TOKEN
 *      wrangler secret put CHAT_ID
 *   6. Полученный URL вписать в CONFIG.rsvpEndpoint в site/index.html
 *
 * Тот же код почти без изменений работает на Yandex Cloud Functions —
 * поменяется только обертка обработчика.
 */

// Откуда принимаем анкеты. Без этой проверки кто угодно мог бы слать
// сообщения в группу со своей страницы.
const ALLOWED_ORIGIN = "https://familysashaandmasha.github.io"; // без слэша в конце

// Локальная проверка перед публикацией: `python3 -m http.server` в папке site.
// Открытый двойным кликом файл сюда не попадает — у него источник «null»,
// и разрешать его нельзя, это дыра.
const isAllowed = (o) =>
  o === ALLOWED_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || "");

function corsFor(request){
  const o = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowed(o) ? o : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: cors });

    let d;
    try { d = await request.json(); }
    catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

    // Минимальная валидация — форма открыта миру, мусор прилетит рано или поздно
    const clip = (v, n) => String(v ?? "").slice(0, n);
    const name = clip(d.name, 80).trim();
    if (!name) return new Response("No name", { status: 400, headers: cors });

    // Без parse_mode: имена и комментарии пишут гости, а любая звездочка,
    // подчеркивание или скобка в разметке роняет отправку целиком —
    // ответ бы просто потерялся, и мы бы об этом не узнали.
    const lines = [
      "Анкета · " + name + (d.token ? " [" + clip(d.token, 24) + "]" : ""),
      d.going === "no"    ? "Не смогут" :
      d.going === "maybe" ? "Пока не решили" :
      "Придут: " + clip(d.goingText, 60) + ", " + (Number(d.seats) || 1),
      d.who ? "Кто: " + clip(d.who, 200) : "",
      d.note ? "Заметка: " + clip(d.note, 600) : ""
    ].filter(Boolean);

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return new Response(JSON.stringify({
        error: "Не заданы секреты. Проверьте: wrangler secret list",
        has_token: Boolean(env.BOT_TOKEN),
        has_chat_id: Boolean(env.CHAT_ID)
      }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const tg = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: lines.join("\n"),
        disable_web_page_preview: true
      })
    });

    // Телеграм присылает внятную причину — ее надо показать, а не прятать
    // за общим «Telegram error». Токен при этом наружу не уходит.
    const res = await tg.json().catch(() => ({}));
    if (!tg.ok || !res.ok) {
      const why = res.description || "неизвестная ошибка";
      console.log("Telegram отказал:", tg.status, why);

      const hint =
        /chat not found/i.test(why)      ? "Бот не состоит в этой группе, либо chat_id не тот. Добавьте бота в группу." :
        /unauthorized/i.test(why)        ? "Неверный BOT_TOKEN. Перезадайте: wrangler secret put BOT_TOKEN" :
        /kicked|not a member/i.test(why) ? "Бота удалили из группы. Добавьте обратно." :
        /supergroup/i.test(why)          ? "Группа стала супергруппой — chat_id поменялся на формат -100…" :
        "Смотрите описание выше.";

      return new Response(JSON.stringify({ error: why, hint }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
};
