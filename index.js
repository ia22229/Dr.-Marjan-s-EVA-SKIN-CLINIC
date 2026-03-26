const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(express.json());

const token = process.env.GRAPH_API_TOKEN;
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Connect to Google Sheets using your secret file
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Keep-Alive Page for UptimeRobot
app.get('/', (req, res) => {
  res.send('Eva Clinic Bot is Live and Ready! ✨');
});

// Meta Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const tokenReceived = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && tokenReceived === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive Messages & Save to Sheets
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      const from = body.entry[0].changes[0].value.messages[0].from;
      const msgBody = body.entry[0].changes[0].value.messages[0].text.body;
      const phoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

      // If they say Hi, send the menu
      if (msgBody.toLowerCase().includes('hi') || msgBody.toLowerCase() === 'booking') {
          await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v22.0/${phoneId}/messages`,
            data: {
              messaging_product: 'whatsapp',
              to: from,
              text: { body: "Welcome to Dr. Marjan's Eva Skin Clinic! ✨\n\nPlease type your details in a single message:\n1. Name\n2. Phone Number\n3. Age / DOB\n4. Place\n5. Gender" }
            },
            headers: { Authorization: `Bearer ${token}` }
          });
      } 
      // If they send multiple lines, it's a registration! Save it to Google Sheets
      else if (msgBody.includes('\n')) {
          const lines = msgBody.split('\n');
          const name = lines[0] || '';
          const phone = lines[1] || '';
          const age = lines[2] || '';
          const place = lines[3] || '';
          const gender = lines[4] || '';
          const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

          const sheets = google.sheets({ version: 'v4', auth });
          await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: 'Sheet1!A:F', // Make sure your Google Sheet tab is named "Sheet1"
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[timestamp, name, phone, age, place, gender]],
            },
          });

          // Reply with confirmation
          await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v22.0/${phoneId}/messages`,
            data: {
              messaging_product: 'whatsapp',
              to: from,
              text: { body: `✅ Thank you for registering!\nWe have recorded:\n\n${name}\n${phone}\n${age}\n${place}\n${gender}\n\nOur team will contact you shortly to finalize the booking.` }
            },
            headers: { Authorization: `Bearer ${token}` }
          });
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Eva Clinic Bot Server is running on port ${PORT}`));
