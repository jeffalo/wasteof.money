const prompts = require("prompts");
const fs = require("fs");
(async () => {
  const response = await prompts([
    {
      type: "text",
      name: "url",
      message: "What is your MongoDB URL?",
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
    `DB_URL=${response.url}
LISTEN_PORT=${response.port}`,
    "utf8",
    function () {
      console.log("Your settings have been written to .env!");
      console.log("Run npm run serve to serve your instance.");
    }
  );
})();
