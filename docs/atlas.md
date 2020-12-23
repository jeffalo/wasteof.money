---
title: Setting up a cloud development database
description: Instructions on how to setup a cloud database for development.
code: true
author: grahamsh
---
Sometimes when you're developing it might not be possible to run a database locally. These steps should help with getting a cloud database from Mongo Atlas and get it configured in your .env file. This is meant for development, it is not recommended for production.

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
### Env
#### Easy Way
- Run
```console
npm run setup
```
#### Manual Way
- Open the repo in vscode (or any editor) and create a file called .env
- Add the text "DB_URL=", and paste the copied string after the = sign
- Replace <password> with your password, and <dbname> with "social"
- Save the file
### Serving
- Finish the readme instructions, skipping the .env section
