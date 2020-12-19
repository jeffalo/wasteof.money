const prompts = require("prompts");
const fs = require("fs");

(async () => {

  const response = await prompts([
    {
      type: "text",
      name: "url",
      message: "What is your MongoDB URL? (If you are using MongoDB Atlas, you can keep the <> values)",
    },
    {
      type: 'select',
      name: 'value',
      message: 'Pick a hosting type',
      choices: [
        { title: 'MongoDB Atlas', description: 'MongoDB Atlas cloud hosting', value: 'atlas' },
        { title: 'Local MongoDB', value: 'local', description: 'A local MongoDB instance' }
      ],
      initial: 1
    },
    {
      type: prev => prev == 'atlas' ? 'password' : null,
      name: "password",
      message: "What is your MongoDB Password?",
    },
    {
      type: "text",
      name: "port",
      message: "What is your port?",
      initial: "8080",
    }
  ]);

  fs.writeFile(
    ".env",
    `DB_URL=${response.url.replace('<password>', response.password).replace('<dbname>', 'social')}
LISTEN_PORT=${response.port}`,
    "utf8",
    function () {
      console.log("Your settings have been written to .env!");
      console.log("Run npm run serve to serve your instance.");
    }
  );
  
})();
