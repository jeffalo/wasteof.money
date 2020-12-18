const prompts = require('prompts');
 
(async () => {
  const response = await prompts({
    type: 'text',
    name: 'meaning',
    message: 'What is the meaning of life?'
  });
 
  console.log(response.meaning);
})();
