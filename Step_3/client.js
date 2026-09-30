const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto"); // 1. Modul bawaan Node.js

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// 2. Generate RSA Key Pair (Private & Public Key) untuk client ini
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

let registeredUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);

    // Daftarkan username dan public key asli yang di-generate
    users.set(username, publicKey);
    socket.emit("registerPublicKey", {
      username,
      publicKey: publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!impersonate (\w+)$/))) {
          username = match[1];
          console.log(`Now impersonating as ${username}`);
        } else if (message.match(/^!exit$/)) {
          username = registeredUsername;
          console.log(`Now you are ${username}`);
        } else {
          // 3. Tanda tangani pesan dengan privateKey client
          const signer = crypto.createSign("sha256");
          signer.update(message);
          signer.end();
          const signature = signer.sign(privateKey, "hex");

          // Bungkus pesan dan signature ke dalam payload JSON
          const payload = JSON.stringify({
            text: message,
            signature: signature,
          });

          socket.emit("message", { username, message: payload });
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    // Bersihkan baris prompt '> ' agar teks tidak bertumpuk
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);

    let isFake = false;
    let actualText = senderMessage;

    try {
      const parsed = JSON.parse(senderMessage);
      actualText = parsed.text;
      const senderPublicKey = users.get(senderUsername);

      if (senderPublicKey && parsed.signature) {
        // 4. Verifikasi signature menggunakan public key terdaftar milik senderUsername
        const verifier = crypto.createVerify("sha256");
        verifier.update(parsed.text);
        verifier.end();

        const isValid = verifier.verify(senderPublicKey, parsed.signature, "hex");
        if (!isValid) {
          isFake = true;
        }
      } else {
        isFake = true;
      }
    } catch (e) {
      // Jika format pesan tidak valid / tidak memiliki signature
      isFake = true;
    }

    // 5. Tampilkan warning jika verifikasi gagal (impersonasi terdeteksi)
    if (isFake) {
      console.log(`warning: this user is fake`);
    }

    console.log(`${senderUsername}: ${actualText}`);
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