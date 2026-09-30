const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto"); // Modul bawaan Node.js

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let username = "";

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);
    rl.prompt();

    rl.on("line", (message) => {
      const cleanMessage = message.trim();
      if (cleanMessage) {
        // Buat hash dari pesan asli
        const hash = crypto.createHash("sha256").update(cleanMessage).digest("hex");
        // Kirim payload text + hash
        const payload = JSON.stringify({ text: cleanMessage, hash });
        socket.emit("message", { username, message: payload });
      }
      rl.prompt();
    });
  });
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    // Bersihkan baris prompt '> ' agar output rapi dan tidak menumpuk
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);

    let displayText = senderMessage;
    let isTampered = true;

    try {
      // Ambil bagian JSON dan pisahkan jika ada tambahan teks dari server jahat di belakangnya
      const lastBraceIndex = senderMessage.lastIndexOf("}");
      if (lastBraceIndex !== -1) {
        const jsonPart = senderMessage.substring(0, lastBraceIndex + 1);
        const extraPart = senderMessage.substring(lastBraceIndex + 1); // ini akan berisi " (sus?)"

        const parsed = JSON.parse(jsonPart);
        // Gabungkan text pesan asli dengan teks tambahan (tanpa menampilkan hash/JSON)
        displayText = parsed.text + extraPart;

        // Hitung ulang hash dari text yang tampil
        const calculatedHash = crypto.createHash("sha256").update(displayText).digest("hex");

        // Jika hash cocok dan tidak ada teks tambahan, berarti pesan aman
        if (calculatedHash === parsed.hash) {
          isTampered = false;
        }
      }
    } catch (e) {
      isTampered = true;
    }

    // Tampilkan peringatan jika terindikasi diubah
    if (isTampered) {
      console.log("Warning: the message may have been changed during transmission");
    }

    // Tampilkan chat biasa yang bersih
    console.log(`${senderUsername}: ${displayText}`);
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});