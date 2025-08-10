const responses = [
    "Hello there!",
    "Hi, how can I help you?",
    "Hey, what's up?",
    "Greetings!",
    "Nice to meet you!",
];

class ChatManager {
    getRandomResponse() {
        const index = Math.floor(Math.random() * responses.length);
        return responses[index];
    }
}

module.exports = new ChatManager();
