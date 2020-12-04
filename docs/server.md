These instructions may look hard, but they're actually pretty easy! @GrahamSH-LLK completed them on a Chromebook, with no problems. Just follow the instructions! If you have any problems, ask @GrahamSH
### Account
- First, make an account at https://www.mongodb.com/cloud/atlas/register. Fill out the fields, or sign in with Google.
- When it prompts you to pick a provider, pick any option
- Pick the free plan
### DB and Repo Setup
- Keep the default settings for server options, and submit
- On the home screen, wait for the blue status bar to disappear.
- While you are waiting, follow the readme instructions until .env
### Access Setup
- After it finishes, go to "Database Access" on the sidebar
- Set up a user. Add a username, and a password, then submit
- After completing that, go to "Network Access"
- Click "Add IP Address"
-  Select "All", and then confirm
- Once the blue status bar is gone, click "Clusters", and then "Collections"
- Click "Add my own data"
- Set up a database with the name "social" and a collection with the name "users"
- Now, go back to clusters
- Click "Connect"
- Click "Connect your application"
- Copy the URL in the middle of the popup
- Open the repo in vscode (or any editor) and create a file called .env
- Add the text "DB_URL=", and paste the copied string after the = sign.
- Replace <password> with your password, and <dbname> with "social"
- Save the file
### Serving
- Finish the readme instructions, skipping the .env section
