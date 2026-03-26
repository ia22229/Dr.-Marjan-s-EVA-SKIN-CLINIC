const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// This allows your Vercel app to fetch the data securely!
app.use(cors()); 

const token = process.env.GRAPH_API_TOKEN;
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sessions = {}; 
const text = {
  en: {
    welcome: "Welcome to Dr. Marjan's Eva Skin Clinic! ✨\nHow can we help you today?",
    btn_book: "Booking", btn_loc: "Our Location",
    reg_type: "Please select your registration type:",
    btn_exist: "Already a patient", btn_new: "New registration", btn_back: "Back",
    q_name: "Please enter your Name:",
    q_phone: "Please enter your Mobile Number:",
    q_age: "Please enter your Age or DOB:",
    q_place: "Please enter your Place:",
    q_gender: "Please select your Gender:",
    btn_male: "Male", btn_female: "Female",
    done: "✅ Thank you! Your details have been successfully saved. Our team will contact you shortly.",
    loc_msg: "Here is the location for Dr. Marjan's Eva Skin Clinic 🏥:\nhttps://maps.app.goo.gl/4ZPH45KSqqNAP26YA"
  },
  ml: {
    welcome: "ഡോ. മർജാന്റെ ഈവ സ്കിൻ ക്ലിനിക്കിലേക്ക് സ്വാഗതം! ✨\nഞങ്ങൾ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?",
    btn_book: "ബുക്കിംഗ്", btn_loc: "ലൊക്കേഷൻ",
    reg_type: "നിങ്ങളുടെ രജിസ്ട്രേഷൻ തരം തിരഞ്ഞെടുക്കുക:",
    btn_exist: "നിലവിലെ രോഗി", btn_new: "പുതിയ രോഗി", btn_back: "തിരികെ",
    q_name: "നിങ്ങളുടെ പേര് നൽകുക:",
    q_phone: "നിങ്ങളുടെ മൊബൈൽ നമ്പർ നൽകുക:",
    q_age: "നിങ്ങളുടെ പ്രായം അല്ലെങ്കിൽ ജനനത്തീയതി നൽകുക:",
    q_place: "നിങ്ങളുടെ സ്ഥലം നൽകുക:",
    q_gender: "നിങ്ങളുടെ ലിംഗഭേദം തിരഞ്ഞെടുക്കുക:",
    btn_male: "പുരുഷൻ", btn_female: "സ്ത്രീ",
    done: "✅ നന്ദി! നിങ്ങളുടെ വിവരങ്ങൾ സേവ് ചെയ്തിട്ടുണ്ട്. ഞങ്ങളുടെ ടീം നിങ്ങളെ ഉടൻ ബന്ധപ്പെടുന്നതാണ്.",
    loc_msg: "ഡോ. മർജാന്റെ ഈവ സ്കിൻ ക്ലിനിക്കിന്റെ ലൊക്കേഷൻ ഇതാ 🏥:\nhttps://maps.app.goo.gl/4ZPH45KSqqNAP26YA"
  }
};

app.get('/', (req, res) => res.send('Eva Clinic Bilingual Bot is Live! ✨'));

// API for Vercel to securely read the bookings
app.get('/api/bookings', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Sheet1!A:F',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) return res.json([]);
    
    const data = rows.slice(1).map(row => ({
      timestamp: row[0] || '', name: row[1] || '', phone: row[2] || '',
      age: row[3] || '', place: row[4] || '', gender: row[5] || ''
    }));
    
    res.json(data.reverse()); 
  } catch (error) {
    console.error('Error reading sheets:', error);
    res.status(500).send('Error loading bookings');
  }
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

async function sendMessage(phoneId, to, data) {
  await axios({
    method: 'POST',
    url: `https://graph.facebook.com/v22.0/${phoneId}/messages`,
    data: { messaging_product: 'whatsapp', to: to, ...data },
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function saveToSheets(data) {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId,
    range: 'Sheet1!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[timestamp, data.name || '', data.phone || '', data.age || '', data.place || '', data.gender || '']] },
  });
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const phoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

      if (!sessions[from]) sessions[from] = { step: 'idle', lang: 'en', data: {} };
      const user = sessions[from];

      let originalText = '';
      let msgText = '';
      
      if (message.type === 'text') {
        originalText = message.text.body;
        msgText = originalText.toLowerCase();
      } else if (message.type === 'interactive') {
        msgText = message.interactive.button_reply.id;
        originalText = message.interactive.button_reply.title; 
      }

      if (msgText === 'hi' || msgText === 'hello') {
        user.step = 'idle'; user.data = {}; 
        await sendMessage(phoneId, from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: "Please choose your language / ദയവായി നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക:" },
            action: { buttons: [{ type: "reply", reply: { id: "lang_en", title: "English" } }, { type: "reply", reply: { id: "lang_ml", title: "മലയാളം" } }] }
          }
        });
      } else if (msgText === 'lang_en' || msgText === 'lang_ml' || msgText === 'btn_back') {
        if (msgText.startsWith('lang_')) user.lang = msgText === 'lang_en' ? 'en' : 'ml';
        const t = text[user.lang];
        await sendMessage(phoneId, from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: t.welcome },
            action: { buttons: [{ type: "reply", reply: { id: "btn_booking", title: t.btn_book } }, { type: "reply", reply: { id: "btn_location", title: t.btn_loc } }] }
          }
        });
      } else if (msgText === 'btn_location') {
        await sendMessage(phoneId, from, { type: "text", text: { body: text[user.lang].loc_msg } });
      } else if (msgText === 'btn_booking') {
        const t = text[user.lang];
        await sendMessage(phoneId, from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: t.reg_type },
            action: { buttons: [{ type: "reply", reply: { id: "btn_exist", title: t.btn_exist } }, { type: "reply", reply: { id: "btn_new", title: t.btn_new } }, { type: "reply", reply: { id: "btn_back", title: t.btn_back } }] }
          }
        });
      } else if (msgText === 'btn_exist' || msgText === 'btn_new') {
        user.type = msgText === 'btn_exist' ? 'existing' : 'new'; user.step = 'ask_name';
        await sendMessage(phoneId, from, { type: "text", text: { body: text[user.lang].q_name } });
      } else if (user.step !== 'idle' && originalText) {
        const t = text[user.lang];
        if (user.step === 'ask_name') {
          user.data.name = originalText; user.step = 'ask_phone';
          await sendMessage(phoneId, from, { type: "text", text: { body: t.q_phone } });
        } else if (user.step === 'ask_phone') {
          user.data.phone = originalText;
          if (user.type === 'existing') {
             await saveToSheets(user.data); user.step = 'idle';
             await sendMessage(phoneId, from, { type: "text", text: { body: t.done } });
          } else {
             user.step = 'ask_age'; await sendMessage(phoneId, from, { type: "text", text: { body: t.q_age } });
          }
        } else if (user.step === 'ask_age') {
          user.data.age = originalText; user.step = 'ask_place';
          await sendMessage(phoneId, from, { type: "text", text: { body: t.q_place } });
        } else if (user.step === 'ask_place') {
          user.data.place = originalText; user.step = 'ask_gender';
          await sendMessage(phoneId, from, {
            type: "interactive",
            interactive: {
              type: "button", body: { text: t.q_gender },
              action: { buttons: [{ type: "reply", reply: { id: "gender_male", title: t.btn_male } }, { type: "reply", reply: { id: "gender_female", title: t.btn_female } }] }
            }
          });
        } else if (user.step === 'ask_gender') {
          user.data.gender = originalText; await saveToSheets(user.data); user.step = 'idle';
          await sendMessage(phoneId, from, { type: "text", text: { body: t.done } });
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error(error?.response?.data || error); res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Eva Clinic Bot Server is running on port ${PORT}`));
