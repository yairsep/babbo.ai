import { guideFor, nextDue } from './guidance.mjs';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
function cookie(token, request, clear = false) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `babbo_session=${clear ? '' : token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 60 * 60 * 24 * 30}${secure}`;
}
function validOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
async function body(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Expected JSON');
  const text = await request.text();
  if (text.length > 12000) throw new Error('Request too large');
  return JSON.parse(text);
}
async function userFor(request, db) {
  const token = /(?:^|; )babbo_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1];
  if (!token) return null;
  return db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(await sha(token), now()).first();
}
async function event(db, userId, name) {
  await db.prepare('INSERT INTO events (id,user_id,name,created_at) VALUES (?,?,?,?)').bind(id(), userId, name, now()).run();
}
async function session(db, userId, request) {
  const token = `${id()}${id()}`;
  await db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha(token), userId, new Date(Date.now() + 30 * 86400000).toISOString()).run();
  return cookie(token, request);
}
async function profile(db, userId) {
  const row = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first();
  return { ...row, children: JSON.parse(row.children || '[]'), onboarding_done: !!row.onboarding_done };
}
async function aiResponse(env, guide, message, profileData, memories) {
  if (!env.AI || ['urgent', 'clinical', 'ambiguous', 'toddler', 'baby'].includes(guide.kind)) return guide.response;
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: `You are Babbo, a warm, concise guide for dads of children 0-3. Reply in the user's language when possible. Never diagnose, give medical advice, judge a partner, or add developmental claims. Use only the approved guidance below for factual advice. No more than 90 words. One practical next step. No markdown. Approved guidance: ${guide.response}. The user profile is optional context and may be incomplete: ${JSON.stringify({ children: profileData.children, family_setup: profileData.family_setup, challenges: profileData.challenges, language: profileData.language, saved_memories: memories })}.` },
        { role: 'user', content: message }
      ], max_tokens: 180, temperature: 0.35
    });
    const output = typeof result?.response === 'string' ? result.response.trim() : '';
    return output && output.length < 1200 ? output : guide.response;
  } catch { return guide.response; }
}
function actionData(row) { return { ...row, reminder: !!row.reminder }; }

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  if (!db) return fail('Database binding missing', 503);
  if (!['GET', 'HEAD'].includes(method) && !validOrigin(request)) return fail('Invalid origin', 403);
  try {
    if (path === '/api/auth/register' && method === 'POST') {
      const data = await body(request);
      const email = String(data.email || '').trim().toLowerCase();
      const password = String(data.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return fail('Use a valid email and a password of at least 10 characters');
      if (await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return fail('An account already exists for this email', 409);
      const userId = id(), salt = id(), created = now();
      await db.batch([
        db.prepare('INSERT INTO users (id,email,password_hash,salt,created_at) VALUES (?,?,?,?,?)').bind(userId, email, await passwordHash(password, salt), salt, created),
        db.prepare('INSERT INTO profiles (user_id,updated_at) VALUES (?,?)').bind(userId, created)
      ]);
      return json({ user: { id: userId, email }, profile: await profile(db, userId) }, 201, { 'set-cookie': await session(db, userId, request) });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const data = await body(request);
      const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(String(data.email || '').trim().toLowerCase()).first();
      if (!row || await passwordHash(String(data.password || ''), row.salt) !== row.password_hash) return fail('Email or password is incorrect', 401);
      await event(db, row.id, 'return_visit');
      return json({ user: { id: row.id, email: row.email }, profile: await profile(db, row.id) }, 200, { 'set-cookie': await session(db, row.id, request) });
    }
    const user = await userFor(request, db);
    if (!user) return fail('Please sign in', 401);
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = /(?:^|; )babbo_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1];
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ? AND user_id = ?').bind(await sha(token), user.id).run();
      return json({ ok: true }, 200, { 'set-cookie': cookie('', request, true) });
    }
    if (path === '/api/me' && method === 'GET') return json({ user, profile: await profile(db, user.id) });
    if (path === '/api/profile' && method === 'PUT') {
      const data = await body(request);
      const children = Array.isArray(data.children) ? data.children.slice(0, 5).map(x => String(x).slice(0, 40)) : [];
      const family = data.save_sensitive === true ? String(data.family_setup || '').slice(0, 300) : '';
      const challenges = data.save_sensitive === true ? String(data.challenges || '').slice(0, 500) : '';
      const language = ['en', 'nl'].includes(data.language) ? data.language : 'en';
      const reminder = ['in_app', 'email', 'none'].includes(data.reminder_preference) ? data.reminder_preference : 'in_app';
      await db.prepare('UPDATE profiles SET children=?,family_setup=?,challenges=?,language=?,reminder_preference=?,onboarding_done=1,updated_at=? WHERE user_id=?').bind(JSON.stringify(children), family, challenges, language, reminder, now(), user.id).run();
      return json({ profile: await profile(db, user.id) });
    }
    if (path === '/api/conversations' && method === 'GET') {
      const rows = await db.prepare('SELECT id,title,created_at FROM conversations WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
      return json({ conversations: rows.results });
    }
    const convoMatch = /^\/api\/conversations\/([\w-]+)$/.exec(path);
    if (convoMatch && method === 'GET') {
      const convo = await db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').bind(convoMatch[1], user.id).first();
      if (!convo) return fail('Conversation not found', 404);
      const rows = await db.prepare('SELECT id,role,content,source_urls,created_at FROM messages WHERE conversation_id=? AND user_id=? ORDER BY created_at').bind(convo.id, user.id).all();
      return json({ conversation: convo, messages: rows.results.map(x => ({ ...x, source_urls: JSON.parse(x.source_urls) })) });
    }
    if (convoMatch && method === 'DELETE') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm deletion first');
      await db.prepare('DELETE FROM conversations WHERE id=? AND user_id=?').bind(convoMatch[1], user.id).run();
      return json({ ok: true });
    }
    if (path === '/api/messages' && method === 'POST') {
      const data = await body(request);
      const message = String(data.content || '').trim().slice(0, 3000);
      if (!message) return fail('Write a message first');
      let conversationId = String(data.conversation_id || '');
      let exists = conversationId ? await db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(conversationId, user.id).first() : null;
      if (conversationId && !exists) return fail('Conversation not found', 404);
      if (!exists) {
        conversationId = id();
        await db.prepare('INSERT INTO conversations (id,user_id,title,created_at) VALUES (?,?,?,?)').bind(conversationId, user.id, message.slice(0, 55), now()).run();
        await event(db, user.id, 'first_conversation');
      }
      const guide = guideFor(message);
      const saved = await db.prepare('SELECT content FROM memories WHERE user_id=? ORDER BY created_at DESC LIMIT 10').bind(user.id).all();
      const reply = await aiResponse(env, guide, message, await profile(db, user.id), saved.results.map(x => x.content));
      const sources = guide.sources.map(s => s.url);
      const userMessage = { id: id(), role: 'user', content: message, source_urls: [], created_at: now() };
      const assistantMessage = { id: id(), role: 'assistant', content: reply, source_urls: sources, created_at: now() };
      await db.batch([
        db.prepare('INSERT INTO messages (id,conversation_id,user_id,role,content,source_urls,created_at) VALUES (?,?,?,?,?,?,?)').bind(userMessage.id, conversationId, user.id, userMessage.role, message, '[]', userMessage.created_at),
        db.prepare('INSERT INTO messages (id,conversation_id,user_id,role,content,source_urls,created_at) VALUES (?,?,?,?,?,?,?)').bind(assistantMessage.id, conversationId, user.id, assistantMessage.role, reply, JSON.stringify(sources), assistantMessage.created_at)
      ]);
      return json({ conversation_id: conversationId, user_message: userMessage, assistant_message: assistantMessage, proposal: guide.action ? { title: guide.action, recurrence: guide.recurrence, due_at: new Date(Date.now() + 86400000).toISOString() } : null });
    }
    if (path === '/api/actions' && method === 'GET') {
      const rows = await db.prepare('SELECT * FROM actions WHERE user_id=? ORDER BY status ASC,due_at ASC LIMIT 100').bind(user.id).all();
      return json({ actions: rows.results.map(actionData) });
    }
    if (path === '/api/actions' && method === 'POST') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm the action first');
      const title = String(data.title || '').trim().slice(0, 150);
      const recurrence = ['none', 'daily', 'weekly'].includes(data.recurrence) ? data.recurrence : 'none';
      const due = new Date(data.due_at);
      if (!title || Number.isNaN(due.getTime())) return fail('Add a title and valid due date');
      const action = { id: id(), title, due_at: due.toISOString(), recurrence, status: 'open', reminder: data.reminder !== false, created_at: now() };
      await db.prepare('INSERT INTO actions (id,user_id,title,due_at,recurrence,status,reminder,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(action.id, user.id, title, action.due_at, recurrence, 'open', action.reminder ? 1 : 0, action.created_at).run();
      await event(db, user.id, 'action_created');
      return json({ action }, 201);
    }
    const actionMatch = /^\/api\/actions\/([\w-]+)$/.exec(path);
    if (actionMatch && method === 'PATCH') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm the change first');
      const row = await db.prepare('SELECT * FROM actions WHERE id=? AND user_id=?').bind(actionMatch[1], user.id).first();
      if (!row) return fail('Action not found', 404);
      if (data.complete === true) {
        if (row.recurrence === 'none') await db.prepare("UPDATE actions SET status='done',completed_at=? WHERE id=? AND user_id=?").bind(now(), row.id, user.id).run();
        else await db.prepare('UPDATE actions SET due_at=?,completed_at=? WHERE id=? AND user_id=?').bind(nextDue(row.due_at, row.recurrence), now(), row.id, user.id).run();
        await event(db, user.id, 'task_completion');
      } else {
        const title = String(data.title ?? row.title).trim().slice(0, 150);
        const due = new Date(data.due_at ?? row.due_at);
        const recurrence = ['none','daily','weekly'].includes(data.recurrence) ? data.recurrence : row.recurrence;
        if (!title || Number.isNaN(due.getTime())) return fail('Add a title and valid due date');
        await db.prepare('UPDATE actions SET title=?,due_at=?,recurrence=?,reminder=? WHERE id=? AND user_id=?').bind(title, due.toISOString(), recurrence, data.reminder === false ? 0 : 1, row.id, user.id).run();
      }
      return json({ action: actionData(await db.prepare('SELECT * FROM actions WHERE id=? AND user_id=?').bind(row.id,user.id).first()) });
    }
    if (actionMatch && method === 'DELETE') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm deletion first');
      await db.prepare('DELETE FROM actions WHERE id=? AND user_id=?').bind(actionMatch[1], user.id).run();
      return json({ ok: true });
    }
    if (path === '/api/memories' && method === 'GET') {
      const rows = await db.prepare('SELECT * FROM memories WHERE user_id=? ORDER BY created_at DESC').bind(user.id).all();
      return json({ memories: rows.results });
    }
    if (path === '/api/memories' && method === 'POST') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm saving this memory first');
      const content = String(data.content || '').trim().slice(0, 500);
      if (!content) return fail('Memory cannot be empty');
      const memory = { id: id(), content, created_at: now() };
      await db.prepare('INSERT INTO memories (id,user_id,content,created_at) VALUES (?,?,?,?)').bind(memory.id,user.id,content,memory.created_at).run();
      return json({ memory }, 201);
    }
    const memoryMatch = /^\/api\/memories\/([\w-]+)$/.exec(path);
    if (memoryMatch && method === 'DELETE') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm deletion first');
      await db.prepare('DELETE FROM memories WHERE id=? AND user_id=?').bind(memoryMatch[1],user.id).run();
      return json({ ok: true });
    }
    if (path === '/api/feedback' && method === 'POST') {
      const data = await body(request);
      if (!['helpful','not_helpful'].includes(data.value)) return fail('Invalid feedback');
      await event(db, user.id, `feedback_${data.value}`);
      return json({ ok: true });
    }
    if (path === '/api/account' && method === 'DELETE') {
      const data = await body(request);
      if (data.confirmed !== true) return fail('Confirm account deletion first');
      await db.batch([
        db.prepare('DELETE FROM events WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM memories WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM messages WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM conversations WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM actions WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM profiles WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM users WHERE id=?').bind(user.id)
      ]);
      return json({ ok: true }, 200, { 'set-cookie': cookie('', request, true) });
    }
    return fail('Not found', 404);
  } catch (error) {
    if (error instanceof SyntaxError || ['Expected JSON','Request too large'].includes(error.message)) return fail(error.message);
    console.error('API error', error);
    return fail('Something went wrong. Please try again.', 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    if (!env.RESEND_API_KEY || !env.REMINDER_FROM_EMAIL) return;
    const end = new Date(Date.now() + 3600000).toISOString();
    const start = now();
    const rows = await env.DB.prepare("SELECT actions.title,actions.due_at,users.email FROM actions JOIN users ON users.id=actions.user_id JOIN profiles ON profiles.user_id=users.id WHERE actions.status='open' AND actions.reminder=1 AND profiles.reminder_preference='email' AND actions.due_at>=? AND actions.due_at<? LIMIT 100").bind(start,end).all();
    for (const row of rows.results) {
      await fetch('https://api.resend.com/emails', { method:'POST', headers:{ authorization:`Bearer ${env.RESEND_API_KEY}`, 'content-type':'application/json' }, body:JSON.stringify({ from:env.REMINDER_FROM_EMAIL, to:[row.email], subject:'A Babbo commitment is coming up', text:`Your commitment “${row.title}” is due soon. Open Babbo to check it off.` }) });
    }
  }
};
