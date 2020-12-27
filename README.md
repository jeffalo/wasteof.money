# wasteof.money
wasteof.money is a social media with aspects inspired from Twitter and Scratch. 
| Pictures             |  
:-------------------------:|
![](https://user-images.githubusercontent.com/64214252/101201862-5e1c9f00-3636-11eb-8872-fed504864817.png)  
![](https://user-images.githubusercontent.com/40470736/101082518-ddb15c00-35ab-11eb-933b-babb15b19cd3.png) 
![](https://user-images.githubusercontent.com/40470736/101082530-e2761000-35ab-11eb-9728-373d29ab7579.png)  
## How to install to help contribute
wasteof.money requires a mongodb database to function. You can use a free cloud hosted version by following the instructions [here](https://github.com/jeffalo/wasteof.money/blob/master/docs/atlas.md).
### Setup 
Install node, npm and mongodb.

### Start
First, clone the repo.
```sh 
git clone https://github.com/jeffalo/wasteof.money.git
```
Next, open the folder
```sh 
cd wasteof.money
```
Next, install it and its dependancies
```sh 
npm i
```
Next, build the css
```sh
npm run tailwind:build
```

#### .env
Set up your .env

Either run ``npm run setup`` (recommended), or follow these instructions.
- MongoDB needs DB_URL env variable (For example, DB_URL=localhost/social)
- (Optional) LISTEN_PORT env variable default 8080

Finally, start the app!

```sh 
node .
```








