const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto"); // 1. Modul bawaan Node.js

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// 2. Generate RSA Key Pair untuk client ini
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

let targetUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);

    // Daftarkan public key asli ke server
    users.set(username, publicKey);
    socket.emit("registerPublicKey", {
      username,
      publicKey: publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!secret (\w+)$/))) {
          targetUsername = match[1];
          console.log(`Now secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          // 3. Logika Enkripsi jika sedang dalam mode secret
          if (targetUsername) {
            const targetPublicKey = users.get(targetUsername);

            if (targetPublicKey) {
              try {
                // Enkripsi pesan menggunakan public key milik target
                const encryptedBuffer = crypto.publicEncrypt(
                  {
                    key: targetPublicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256",
                  },
                  Buffer.from(message)
                );

                // Kirim ciphertext dalam format base64
                const encryptedMessage = encryptedBuffer.toString("base64");
                socket.emit("message", { username, message: encryptedMessage });
              } catch (err) {
                console.log(`Error encrypting message: ${err.message}`);
              }
            } else {
              console.log(`User ${targetUsername} not found or public key missing.`);
            }
          } else {
            // Pesan publik biasa (tanpa enkripsi)
            socket.emit("message", { username, message });
          }
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
    // Bersihkan baris prompt '> ' agar rapi
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);

    let displayMessage = senderMessage;

    // 4. Coba dekripsi pesan menggunakan privateKey client ini
    try {
      const bufferToDecrypt = Buffer.from(senderMessage, "base64");
      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        bufferToDecrypt
      );

      // Jika berhasil didekripsi, tampilkan teks asli (plaintext)
      displayMessage = decrypted.toString("utf8");
    } catch (e) {
      // Jika gagal dekripsi (artinya pesan dienkripsi untuk user lain):
      // displayMessage tetap senderMessage (gibberish/ciphertext)
    }

    console.log(`${senderUsername}: ${displayMessage}`);
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