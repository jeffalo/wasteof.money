const prompts = require("prompts");
const fs = require("fs");
require("dotenv").config();
const port = process.env.LISTEN_PORT || 8080;
const url = process.env.DB_URL || 'localhost/social';

(async () => {
  const response = await prompts([
    {
      type: "text",
      name: "url",
      message:
        "What is your MongoDB URL? (If you are using MongoDB Atlas, you can keep the <> values)",
      initial: url
    },
    {
      type: "select",
      name: "value",
      message: "Pick a hosting type",
      choices: [
        {
          title: "MongoDB Atlas",
          description: "MongoDB Atlas cloud hosting",
          value: "atlas",
        },
        {
          title: "Local MongoDB",
          value: "local",
          description: "A local MongoDB instance",
        },
      ],
    },
    {
      type: (prev) => (prev == "atlas" ? "password" : null),
      name: "password",
      message: "What is your MongoDB Password?",
    },
    {
      type: "text",
      name: "port",
      message: "What port should the site run on?",
      initial: port,
    },
  ]);

  fs.writeFile(
    ".env",
    `DB_URL=${response.url
      .replace("<password>", response.password)
      .replace("<dbname>", "social")}\nLISTEN_PORT=${response.port}`,
    "utf8",
    function () {
      console.log("Your settings have been written to .env!");
      console.log("Run npm run serve to start the server or npm run dev to start it with nodemon.");
    }
  );
})();
