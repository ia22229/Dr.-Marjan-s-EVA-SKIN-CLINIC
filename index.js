const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(express.json());

const token = process.env.GRAPH_API_TOKEN;
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Connect to Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Keep-Alive Page for UptimeRobot
app.get('/', (req, res) => res.send('Eva Clinic Bot is Live! ✨'));

// Meta Webhook Verification
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Helper function to send messages easily
async function sendMessage(phoneId, to, data) {
  await axios({
    method: 'POST',
    url: `https://graph.facebook.com/v22.0/${phoneId}/messages`,
    data: { messaging_product: 'whatsapp', to: to, ...data },
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Main Bot Logic
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const phoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

      // Figure out if they typed text OR clicked a button
      let msgText = '';
      if (message.type === 'text') {
        msgText = message.text.body.toLowerCase();
      } else if (message.type === 'interactive') {
        msgText = message.interactive.button_reply.id;
      }

      // 1. WELCOME MENU (Triggered by typing "hi" or clicking "Back")
      if (msgText === 'hi' || msgText === 'hello' || msgText === 'btn_back') {
        await sendMessage(phoneId, from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: "Welcome to Dr. Marjan's Eva Skin Clinic! ✨\nHow can we help you today?" },
            action: {
              buttons: [
                { type: "reply", reply: { id: "btn_booking", title: "Booking" } },
                { type: "reply", reply: { id: "btn_location", title: "Our Location" } }
              ]
            }
          }
        });
      } 
      
      // 2. LOCATION BUTTON CLICKED
      else if (msgText === 'btn_location') {
        await sendMessage(phoneId, from, {
          type: "text",
          text: { body: "Here is the location for Dr. Marjan's Eva Skin Clinic 🏥:\nhttps://maps.app.goo.gl/4ZPH45KSqqNAP26YA" }
        });
      } 
      
      // 3. BOOKING BUTTON CLICKED
      else if (msgText === 'btn_booking') {
        await sendMessage(phoneId, from, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: "Please select your registration type:" },
            action: {
              buttons: [
                { type: "reply", reply: { id: "btn_existing", title: "Already a patient" } },
                { type: "reply", reply: { id: "btn_new", title: "New registration" } },
                { type: "reply", reply: { id: "btn_back", title: "Back" } }
              ]
            }
          }
        });
      } 
      
      // 4. ALREADY A PATIENT CLICKED
      else if (msgText === 'btn_existing') {
        await sendMessage(phoneId, from, {
          type: "text",
          text: { body: "Welcome back! ✨\n\nPlease type your details in a single message (on separate lines):\n1. Name\n2. Mobile Number" }
        });
      } 
      
      // 5. NEW REGISTRATION CLICKED
      else if (msgText === 'btn_new') {
        await sendMessage(phoneId, from, {
          type: "text",
          text: { body: "We look forward to seeing you! ✨\n\nPlease type your details in a single message (on separate lines):\n1. Name\n2. Mobile Number\n3. Age or DOB\n4. Place\n5. Gender" }
        });
      } 
      
      // 6. SAVING TO GOOGLE SHEETS (Triggered when they type multiple lines)
      else if (message.type === 'text' && message.text.body.includes('\n')) {
        const lines = message.text.body.split('\n');
        const name = lines[0] || '';
        const phone = lines[1] || '';
        // If they are an existing patient, lines 2, 3, and 4 will just be empty!
        const age = lines[2] || '';
        const place = lines[3] || '';
        const gender = lines[4] || '';
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId,
          range: 'Sheet1!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[timestamp, name, phone, age, place, gender]] },
        });

        await sendMessage(phoneId, from, {
          type: "text",
          text: { body: `✅ Thank you, ${name}!\nYour details have been successfully saved. Our team will contact you shortly.` }
        });
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error(error?.response?.data || error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Eva Clinic Bot Server is running on port ${PORT}`));
