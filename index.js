require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;

// State management memory to track where the user is in the flow
const userSessions = {};

// GET route: Meta webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// POST route: Receive incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = messageData.from; // Patient's phone number
        const msgType = messageData.type;

        // 1. HANDLE TEXT MESSAGES (Patient Typing Data)
        if (msgType === 'text') {
            const userText = messageData.text.body;
            const currentState = userSessions[from];

            if (currentState === 'WAITING_FOR_OLD_PATIENT_DATA') {
                await sendTextReply(phoneNumberId, from, `✅ Thank you! We have received your details:\n\n${userText}\n\nOur front desk will confirm your slot shortly.`);
                delete userSessions[from]; // Clear memory
                console.log(`NEW BOOKING (OLD PATIENT): ${from} - ${userText}`);
            } 
            else if (currentState === 'WAITING_FOR_NEW_PATIENT_DATA') {
                await sendTextReply(phoneNumberId, from, `✅ Thank you for registering!\nWe have recorded:\n\n${userText}\n\nOur team will contact you to finalize the booking.`);
                delete userSessions[from]; // Clear memory
                console.log(`NEW BOOKING (NEW PATIENT): ${from} - ${userText}`);
            } 
            else {
                // If they type anything else, send the Main Menu
                await sendMainMenu(phoneNumberId, from);
            }
        } 
        
        // 2. HANDLE BUTTON CLICKS
        else if (msgType === 'interactive' && messageData.interactive.type === 'button_reply') {
            const buttonId = messageData.interactive.button_reply.id;

            switch (buttonId) {
                case 'btn_booking':
                    await sendBookingMenu(phoneNumberId, from);
                    break;
                case 'btn_location':
                    await sendTextReply(phoneNumberId, from, "📍 *Dr. Marjan's Eva Skin Clinic*\nWe are located right here in Edavanna.\n\nFind us on Google Maps: https://maps.google.com/?q=Edavanna,+Kerala");
                    break;
                case 'btn_old_patient':
                    userSessions[from] = 'WAITING_FOR_OLD_PATIENT_DATA';
                    await sendTextReply(phoneNumberId, from, "Please type your *Name* and *Registered Phone Number* in a single message:");
                    break;
                case 'btn_new_patient':
                    userSessions[from] = 'WAITING_FOR_NEW_PATIENT_DATA';
                    await sendTextReply(phoneNumberId, from, "Welcome! ✨ Please type your details in a single message:\n\n1. Name\n2. Phone Number\n3. Age / DOB\n4. Place\n5. Gender");
                    break;
                case 'btn_back':
                    delete userSessions[from]; // Clear any stuck state
                    await sendMainMenu(phoneNumberId, from);
                    break;
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404); // Not a WhatsApp API event
    }
});

// --- PAYLOAD BUILDER FUNCTIONS ---

async function sendMainMenu(phoneNumberId, recipientPhone) {
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "Welcome to *Dr. Marjan's Eva Skin Clinic* ✨\n\nExpert dermatological care. Please select an option below:" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "btn_booking", title: "Booking" } },
                    { type: "reply", reply: { id: "btn_location", title: "Our Location" } }
                ]
            }
        }
    };
    await sendToMeta(phoneNumberId, payload);
}

async function sendBookingMenu(phoneNumberId, recipientPhone) {
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "Are you an existing patient or is this your first visit?" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "btn_old_patient", title: "Already a Patient" } },
                    { type: "reply", reply: { id: "btn_new_patient", title: "New Registration" } },
                    { type: "reply", reply: { id: "btn_back", title: "🔙 Back" } }
                ]
            }
        }
    };
    await sendToMeta(phoneNumberId, payload);
}

async function sendTextReply(phoneNumberId, recipientPhone, messageText) {
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "text",
        text: { preview_url: true, body: messageText }
    };
    await sendToMeta(phoneNumberId, payload);
}

// --- NETWORK REQUEST HANDLER ---
async function sendToMeta(phoneNumberId, payload) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, payload, {
            headers: {
                'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Meta API Error:', error.response ? error.response.data : error.message);
    }
}

// Start Server
app.listen(PORT || 3000, () => {
    console.log(`Eva Clinic Bot Server is running on port ${PORT || 3000}`);
});
