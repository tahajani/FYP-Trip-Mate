const PROVIDER_FIELD = { google: 'googleId', facebook: 'facebookId' };

// Pure decision function (no database), easy to unit test later.
function decideSocialLogin({ provider, profile, byProviderId, byEmail }) {
  const field = PROVIDER_FIELD[provider];
  if (byProviderId) return { action: 'login', user: byProviderId };
  if (!profile.email) return { action: 'reject', reason: 'no_email' };
  if (byEmail) {
    if (byEmail[field] && byEmail[field] !== profile.providerId) {
      return { action: 'reject', reason: 'provider_mismatch' };
    }
    // Link to an existing account only if the provider says the email is verified.
    if (!profile.emailVerified) return { action: 'reject', reason: 'email_not_verified' };
    return { action: 'link', user: byEmail };
  }
  return { action: 'create' };
}

async function verifyGoogleIdToken(idToken) {
  const { OAuth2Client } = require('google-auth-library');
  const audiences = (process.env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!audiences.length) throw new Error('GOOGLE_CLIENT_IDS is not set');
  const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience: audiences });
  const p = ticket.getPayload();
  return { providerId: p.sub, email: p.email, name: p.name, emailVerified: p.email_verified === true };
}

// NOT checked against the current Facebook Graph API docs. Verify with Meta's documentation.
async function verifyFacebookToken(accessToken) {
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) throw new Error('FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set');
  const q = encodeURIComponent;
  const dbg = await (await fetch(
    `https://graph.facebook.com/debug_token?input_token=${q(accessToken)}&access_token=${q(`${appId}|${secret}`)}`
  )).json();
  if (!dbg.data || !dbg.data.is_valid || String(dbg.data.app_id) !== String(appId)) {
    throw new Error('Invalid Facebook token');
  }
  const me = await (await fetch(
    `https://graph.facebook.com/me?fields=id,name,email&access_token=${q(accessToken)}`
  )).json();
  if (!me.id) throw new Error('Facebook profile could not be read');
  // emailVerified false on purpose: prevents linking to existing accounts by email.
  return { providerId: me.id, email: me.email, name: me.name, emailVerified: false };
}

// Finds, links or creates the user. Every created/linked user is saved in MongoDB.
async function loginWithProvider(provider, profile) {
  const User = require('../models/User'); // lazy, so unit tests need no database
  const field = PROVIDER_FIELD[provider];
  const email = profile.email ? profile.email.toLowerCase() : undefined;

  const byProviderId = await User.findOne({ [field]: profile.providerId });
  const byEmail = email ? await User.findOne({ email }) : null;
  const d = decideSocialLogin({ provider, profile: { ...profile, email }, byProviderId, byEmail });

  if (d.action === 'reject') {
    const err = new Error(d.reason);
    err.status = 400;
    throw err;
  }
  if (d.action === 'login') return d.user;
  if (d.action === 'link') {
    d.user[field] = profile.providerId;
    await d.user.save();
    return d.user;
  }
  return User.create({ name: profile.name || email.split('@')[0], email, [field]: profile.providerId });
}

module.exports = { decideSocialLogin, verifyGoogleIdToken, verifyFacebookToken, loginWithProvider };