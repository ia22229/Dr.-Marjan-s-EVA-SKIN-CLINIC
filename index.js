const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const token = process.env.GRAPH_API_TOKEN;
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

// This is the "Home" page that keeps the bot awake and turns UptimeRobot green
app.get('/', (req, res) => {
  res.send('Eva Clinic Bot is Live and Ready! ✨');
});

// WhatsApp Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const tokenReceived = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && tokenReceived) {
    if (mode === 'subscribe' && tokenReceived === verifyToken) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handling WhatsApp Messages
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      const from = body.entry[0].changes[0].value.messages[0].from;
      const msgBody = body.entry[0].changes[0].value.messages[0].text.body;

      console.log(`Message from ${from}: ${msgBody}`);

      // Automated Reply Logic
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v22.0/${body.entry[0].changes[0].value.metadata.phone_number_id}/messages`,
        data: {
          messaging_product: 'whatsapp',
          to: from,
          text: { body: "Welcome to Dr. Marjan's Eva Skin Clinic! 🏥 How can we help you today?" }
        },
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Eva Clinic Bot Server is running on port ${PORT}`));
