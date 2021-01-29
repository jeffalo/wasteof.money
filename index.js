const express = require("express");
const ejs = require("ejs");
const marked = require("marked");
const matter = require("gray-matter");
const rateLimit = require("express-rate-limit");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
const cookie = require('cookie')
var bcrypt = require("bcrypt");
var sizeOf = require('image-size');
const fs = require("fs");
const path = require("path");

const jdenticon = require("jdenticon");

require("dotenv").config();

const port = process.env.LISTEN_PORT || 8080;
const app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const monk = require("monk")
const db = monk(process.env.DB_URL);

//database
const users = db.get("users")
const posts = db.get("posts")
const comments = db.get("comments")
const messages = db.get("messages")

users.createIndex("name", { unique: true });

(async () => { // todo: this shouldn't reset ghost's followers/following
  const ghostUser = {
    _id: monk.id('000000000000000000000000'),
    name: "ghost",
    password: '',
    followers: [],
    admin: true
  }

  var findGhostUser = await users.findOne({ _id: monk.id('000000000000000000000000') })
  if (findGhostUser) {
    //console.log('ghost user found, updating')
    await users.update({ _id: monk.id('000000000000000000000000') }, { $set: ghostUser })
  } else {
    users.insert(ghostUser)
  }
})()


const saltRounds = 10;
const usernameRegex = /^[a-z0-9_\-]{1,20}$/;

var tokens = [];

app.set('trust proxy', 1);

app.use(
  express.static("static", {
    extensions: ["html", "htm"]
  })
);

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cookieParser());

app.use(function (req, res, next) {
  if (req.url == "/") return next();
  if (req.url.slice(-1) == "/") {
    res.redirect(req.url.slice(0, -1));
  } else {
    next();
  }
});

app.use(async (req, res, next) => {
  var userCookie = req.cookies.token,
    user = findUser(userCookie);
  if (user) {
    res.locals.requester = await findUserDataByID(user.id);
    if (res.locals.requester) {
      res.locals.loggedIn = true;
    } else {
      res.locals.loggedIn = false; // the account was deleted but token remains
      removeToken(userCookie);
    }
  } else {
    res.locals.loggedIn = false;
  }
  next();
});

app.use(
  "/api/",
  rateLimit({
    windowMs: 1000,
    max: 10,
    handler(req, res) {
      res.status(429).json({ error: "too many request" });
    }
  })
);

function checkLoggedIn(cb) {
  const callback =
    cb ||
    function (req, res) {
      if (req.method === "GET") res.redirect("/");
      else res.status(401).json({ error: "requires login" });
    };
  return function (req, res, next) {
    if (!res.locals.loggedIn) callback(req, res, next);
    else next();
  };
}

function checkLoggedOut(cb) {
  const callback =
    cb ||
    function (req, res) {
      if (req.method === "GET") res.redirect("/");
      else
        res
          .status(412)
          .json({ error: "can't complete this action while logged in" });
    };
  return function (req, res, next) {
    if (res.locals.loggedIn) callback(req, res, next);
    else next();
  };
}

app.get("/", function (req, res) {
  var user = res.locals.requester,
    loggedIn = res.locals.loggedIn;

  ejs.renderFile(
    __dirname + "/pages/index.ejs",
    { user, loggedIn },
    (err, str) => {
      if (err) console.log(err);
      res.send(str);
    }
  );
});

//docs
app.get("/docs", async (req, res, next) => {
  res.redirect("/docs/home"); // redirect docs homepage TODO: https://stackoverflow.com/a/63986681
});

app.get("/docs/:page", async (req, res, next) => {
  let docarray = [];

  var user = res.locals.requester,
    loggedIn = res.locals.loggedIn,
    page = path.basename(req.params.page);

  fs.readdir("./docs/", async (err, files) => {
    for (var i in files) {
      var post = await fs.promises.readFile(`./docs/${files[i]}`, "utf-8");
      var matteredData = matter(post);
      matteredData.data.url = files[i].replace(".md", "");

      docarray.push(matteredData);
    }
    //sort docarray real quick
    docarray.sort(function (a, b) {
      if (a.data.title < b.data.title) {
        return -1;
      }
      if (a.data.title > b.data.title) {
        return 1;
      }
      return 0;
    });

    docarray.forEach((doc, i) => {
      // move home to the top
      if (doc.data.title === "Home") {
        docarray.splice(i, 1); // remove it
        docarray.unshift(doc); // add it back to the start
      }
    });

    try {
      var post = await fs.promises.readFile(`./docs/${page}.md`, "utf-8");

      const mattered = matter(post),
        html = marked(mattered.content);

      mattered.data.url = page;

      var doc = {
        meta: mattered.data,
        body: html
      };

      ejs.renderFile(
        __dirname + "/pages/docs.ejs",
        { user, loggedIn, doc, docarray },
        (err, str) => {
          if (err) console.log(err);
          res.send(str);
        }
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        next();
      } else {
        throw err;
      }
    }
  });
});

app.get("/login", checkLoggedOut(), function (req, res) {
  ejs.renderFile(
    __dirname + "/pages/login.ejs",
    { user: null, loggedIn: false }, // we know they're logged out because of the checkLoggedOut middleware
    (err, str) => {
      if (err) console.log(err);
      res.send(str);
    }
  );
});

app.get("/join", checkLoggedOut(), function (req, res) {
  ejs.renderFile(
    __dirname + "/pages/join.ejs",
    { user: null, loggedIn: false }, // ditto
    (err, str) => {
      if (err) console.log(err);
      res.send(str);
    }
  );
});

app.get("/logout", checkLoggedIn(), function (req, res) {
  var userCookie = req.cookies.token;
  removeToken(userCookie);
  res.cookie("token", "");
  res.redirect("/");
});

app.post(
  "/login",
  checkLoggedOut((req, res) =>
    res.status(412).json({ error: "already logged in" })
  ),
  async function (req, res) {
    if (req.is("application/json")) {
      var username = req.body.username.toLowerCase();
      var password = req.body.password;
      const user = await findUserData(username);

      if (user) {
        bcrypt.compare(password, user.password, function (err, result) {
          if (result) {
            var token = makeToken(32);
            addToken(token, user._id);
            res.cookie("token", token);
            res.json({ ok: "Logged in successfully!" });
          } else {
            //password was incorrect
            res.status(401).json({ error: "incorrect username or password" });
          }
        });
      } else {
        res.status(404).json({ error: "incorrect username or password" });
      }
    } else {
      res.status(415).json({ error: "must send json data" });
    }
  }
);

app.post(
  "/join",
  checkLoggedOut((req, res) =>
    res.status(412).json({ error: "can't create new account whilst logged in" })
  ) /* ditto */,
  rateLimit({
    windowMs: 3600000,
    max: 5,
    skipFailedRequests: true,
    handler(req, res) {
      res.status(429).json({
        error:
          "too many accounts created with this IP - please try again in an hour"
      });
    }
  }),
  async function (req, res) {
    if (req.is("application/json")) {
      var username = req.body.username.toLowerCase(),
        password = req.body.password;
      bcrypt.hash(password, saltRounds, async function (err, hashedPassword) {
        if (err) {
          console.log(err);
          res.status(500).json({ error: "password hashing error" });
        } else if (usernameRegex.test(username)) {
          //check if username matches criteria
          users
            .insert({
              name: username,
              password: hashedPassword,
              followers: []
            })
            .then(user => {
              console.log(user);
              var token = makeToken(32);
              addToken(token, user._id);
              res.cookie("token", token);

              res.json({ ok: "made account successfully" });
            })
            .catch(err => {
              if (err.code == 11000) {
                res.status(409).json({ error: "username already taken" });
              } else {
                console.log(err);
                res.status(500).json({
                  error: "uncaught database error: " + err.code
                }); // todo: don't do this on prod.
              }
            });
        } else {
          //username does not match criterai
          res.status(422).json({
            error: `username must match regex ${usernameRegex.toString()}`
          });
        }
      });
    } else {
      res.status(415).json({ error: "must be json" });
    }
  }
);

app.post("/update-username", checkLoggedIn(), async (req, res) => {
  var userCookie = req.cookies.token,
    user = res.locals.requester,
    username = req.body.username;

  if (req.is("application/json")) {
    if (usernameRegex.test(username)) {
      try {
        await users.update({ _id: user._id }, { $set: { name: username } });
        removeToken(userCookie);
        res.cookie("token", "");
        res.json({ ok: username });
      } catch (err) {
        if (err.code == 11000) {
          res.status(409).json({ error: "username already taken" });
        } else {
          console.log(err);
          res
            .status(500)
            .json({ error: "uncaught database error: " + err.code }); // todo: don't do this on prod.
        }
      }
    } else {
      res
        .status(422)
        .json({ error: `must match regex ${usernameRegex.toString()}` });
    }
  } else {
    res.status(403).json({ error: "not made with xhr" }); // is this the right status?
  }
});

app.post("/delete-account", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester;

  if (req.xhr && user) {
    res.status(501).json({ error: "account deletion is not implemented yet" });
  } else {
    res.status(403).json({
      error: "not requested with xhr or no user found"
    }); // seperate this thing up
  }
});

app.get("/explore", async function (req, res) {
  var user = res.locals.requester,
    loggedIn = res.locals.loggedIn;

  ejs.renderFile(
    __dirname + "/pages/explore.ejs",
    { user, loggedIn, loggedInUser: user },
    (err, str) => {
      if (err) console.log(err);
      res.send(str);
    }
  );
});

app.get("/settings", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester,
    loggedIn = res.locals.loggedIn;
  // logged in settings page
  ejs.renderFile(
    __dirname + "/pages/settings.ejs",
    { user, loggedIn },
    (err, str) => {
      if (err) console.log(err);
      res.send(str);
    }
  );
});

app.get("/api/top/users", async (req, res) => {
  // top 10 or something most followed users
  var top = await users.aggregate([
    { $unwind: "$followers" },
    {
      "$group": {
        "_id": "$_id",
        "name": { "$first": "$name" },
        "followers": { "$sum": 1 }
      }
    },
    { $sort: { followers: -1 } },
    { $limit: 10 }
  ])

  res.json(top.map(u => ({ id: u._id, name: u.name, followers: u.followers })))
})

app.get("/api/top/posts", async (req, res) => {
  // top 10 or so most loved posts
})

app.get("/api/trending/posts", async (req, res) => {
  var trending = await posts.aggregate([{ $sample: { size: 10 } }])
  for (var i in trending) {
    var poster = await findUserDataByID(trending[i].poster);
    trending[i].poster = {}
    if (poster) {
      trending[i].poster.name = poster.name;
      trending[i].poster.id = poster._id
    } else {
      trending[i].poster.name = 'ghost';
      trending[i].poster.id = '000000000000000000000000'
    }
  }
  res.json(trending)
})

app.get("/api/following/posts", checkLoggedIn(), async (req, res) => {
  // give posts by people the loggedIn user is following
  var user = res.locals.requester
  var page = parseInt(req.query.page) || 1;

  var following = await users.find({ followers: { $all: [user._id.toString()] } })
  var postsByFollowing = await posts.find({ poster: { $in: following.map(f => f._id) } }, { sort: { time: -1, _id: -1 }, limit: 15, skip: (page - 1) * 15 });

  for (var i in postsByFollowing) {
    var poster = await findUserDataByID(postsByFollowing[i].poster);
    postsByFollowing[i].poster = {}
    if (poster) {
      postsByFollowing[i].poster.name = poster.name;
      postsByFollowing[i].poster.id = poster._id
    } else {
      postsByFollowing[i].poster.name = 'ghost'
      postsByFollowing[i].poster.id = '000000000000000000000000'
    }
  }
  var last = false
  var nextPosts = await posts.find({ poster: { $in: following.map(f => f._id) } }, { sort: { time: -1, _id: -1 }, limit: 15, skip: (page) * 15 });
  if (nextPosts.length == 0) last = true // if there are no posts on the next page, then there must not any more pages, thus this is the last page, i figured this out by my self cool eyes emoji

  res.json({ posts: postsByFollowing, last });
})

app.get("/api/messages", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester
  var page = parseInt(req.query.page) || 1

  var msgs = await messages.find(
    { to: user._id.toString() },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page - 1) * 15 }
  )

  var last = false
  var nextMsgs = await messages.find(
    { to: user._id.toString() },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page) * 15 }
  );
  if (nextMsgs.length == 0) last = true
  var unread = msgs.filter(m => m.read == false)
  var read = msgs.filter(m => m.read == true)
  res.json({ unread, read, last });
});

app.get("/api/messages/count", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester
  var msgs = await messages.find({ to: user._id.toString(), read: false })
  res.json({ count: msgs.length })
});

app.post("/api/messages/read", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester;

  if (req.xhr) {
    try {
      await messages.update({ to: user._id.toString(), read: false }, { $set: { read: true } }, { multi: true })
      var sockets = findSocketsByID(user._id)
      sockets.forEach(s => {
        s.socket.emit('updateMessageCount', 0)
      })
      res.json({ ok: "cleared messages" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "uncaught server error" });
    }
  } else {
    res.status(403).json({ error: "must be requested with xhr" });
  }
});

app.get(
  "/messages",
  checkLoggedIn((req, res) => res.redirect("/login")),
  async (req, res) => {
    var user = res.locals.requester,
      loggedIn = res.locals.loggedIn;
    ejs.renderFile(
      __dirname + "/pages/messages.ejs",
      { user, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  }
);

app.get("/users", function (req, res) {
  users.find({}).then(docs => {
    var userList = [];
    docs.forEach(i => {
      userList.push({ name: i.name });
    });
    res.json(userList);
  });
});

app.get("/api/users/:user", async (req, res) => {
  var user = await findUserData(req.params.user);
  if (user) {
    var following = await users.find({ followers: { $all: [user._id.toString()] } })
    res.json({
      _id: user._id,
      name: user.name,
      followers: user.followers.length,
      following: following.length
    });
  } else {
    res.status(404).json({ error: "no user found" });
  }
});

//TODO: user follower api

app.get("/api/users/:user/posts", async (req, res) => {
  var user = await findUserData(req.params.user)
  var page = parseInt(req.query.page) || 1;

  var userPosts = await posts.find(
    { poster: user._id },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page - 1) * 15 }
  ); //sort by time but fallback to id

  for (var i in userPosts) {
    var poster = await findUserDataByID(userPosts[i].poster);
    userPosts[i].poster = {}
    if (poster) {
      userPosts[i].poster.name = poster.name; // this is inefficent, we know the user will always be the smae, but mongodb is webscale so this won't be an issue
      userPosts[i].poster.id = poster._id
    } else {
      userPosts[i].poster.name = 'ghost'
      userPosts[i].poster.id = '000000000000000000000000'
    }
  }

  var last = false
  var nextPosts = await posts.find(
    { poster: user._id },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page) * 15 }
  );
  if (nextPosts.length == 0) last = true // if there are no posts on the next page, then there must not any more pages, thus this is the last page, i figured this out by my self cool eyes emoji
  res.json({ posts: userPosts, last });
});

app.get("/api/users/:user/posts/:post", async (req, res) => {
  res.redirect(`/api/posts/${req.params.post}`);
});

app.get("/users/:user", async function (req, res, next) {
  var loggedInUser = res.locals.requester,
    loggedIn = res.locals.loggedIn,
    user = await findUserData(req.params.user);

  if (user) {
    var following = await users.find({ followers: { $all: [user._id.toString()] } })
    user.following = following

    ejs.renderFile(
      __dirname + "/pages/user.ejs",
      { user, loggedInUser, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  } else {
    next(); //go to 404
  }
});

app.get("/api/users/:user/followers", async function (req, res, next) {
  var user = await findUserData(req.params.user);
  var followers = []
  for (i in user.followers) {
    var u = await findUserDataByID(user.followers[i]);
    if (u) {
      followers.push({
        id: u._id,
        name: u.name
      })
    } else {
      followers.push({
        id: '000000000000000000000000',
        name: 'ghost'
      })
    }
  }
  followers.reverse() // we want the followers in order starting with the newest
  res.json(followers)
})

app.get("/users/:user/followers", async function (req, res, next) {
  var loggedInUser = res.locals.requester,
    loggedIn = res.locals.loggedIn,
    user = await findUserData(req.params.user);

  if (user) {
    ejs.renderFile(
      __dirname + "/pages/followers.ejs",
      { user, loggedInUser, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  } else {
    next(); //go to 404
  }
});

app.get("/api/users/:user/following", async function (req, res, next) {
  var user = await findUserData(req.params.user);
  var followingDB = await users.find({ followers: { $all: [user._id.toString()] } })
  var following = []
  for (i in followingDB) {
    var u = await findUserDataByID(followingDB[i]._id);

    if (u) {
      following.push({
        id: u._id,
        name: u.name
      })
    } else {
      following.push({
        id: '000000000000000000000000',
        name: 'ghost'
      })
    }
  }
  following.reverse() // we want the followers in order starting with the newest
  res.json(following)
})

app.get("/users/:user/following", async function (req, res, next) {
  var loggedInUser = res.locals.requester,
    loggedIn = res.locals.loggedIn,
    user = await findUserData(req.params.user);

  if (user) {
    ejs.renderFile(
      __dirname + "/pages/following.ejs",
      { user, loggedInUser, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  } else {
    next(); //go to 404
  }
});

app.delete("/picture/:user", checkLoggedIn(), async (req, res) => { // 
  var requester = res.locals.requester
  if (!req.xhr) return res.status(403).json({ error: "must be requested with xhr" });

  if (req.params.user == requester._id) {
    try {
      await fs.promises.unlink(`./uploads/profiles/${req.params.user}.png`)
      res.json({ ok: 'deleted picture' })
    }
    catch (err) {
      console.log(err)
      res.status(500).json({ error: 'failed to delete file' })
    }
  } else {
    res.status(403).json({ error: ':user and requester dont match' })
  }
})

app.post("/picture/:user", checkLoggedIn(), async (req, res) => {
  // todo, verify image dimentions etc etc
  var requester = res.locals.requester
  if (!req.xhr) return res.status(403).json({ error: "must be requested with xhr" });
  if (req.params.user == requester._id) {
    //console.log(req.body.image.toString())
    var data = req.body.image
    var base64Data = data.replace(/^data:image\/png;base64,/, "");
    base64Data += base64Data.replace('+', ' ');
    binaryData = Buffer.from(base64Data, 'base64').toString('binary');
    try {
      const dimensions = await sizeOf(Buffer.from(base64Data, 'base64'));
      if (dimensions.width == 500 && dimensions.height == 500 && dimensions.type == 'png') {
        await fs.promises.writeFile(`./uploads/profiles/${req.params.user}.png`, binaryData, "binary")
        res.json({ ok: 'uploaded image successfully' })
      } else {
        res.status(422).json({ error: 'bad image size' })
      }
    }
    catch (err) {
      console.log(err)
      res.status(500).json({ error: 'faild to write image to disk' })
    }
  } else {
    res.status(403).json({ error: ':user and requester dont match' })
  }
})

app.get("/picture/:user", async function (req, res, next) {
  var user = await findUserDataByID(req.params.user)

  if (user) {
    if (fs.existsSync(`./uploads/profiles/${user._id}.png`)) { // if the user has an image, send that
      res.sendFile(__dirname + `/uploads/profiles/${user._id}.png`);
    } else { // if the user exists but doesnt have an image make one from their name
      var file = jdenticon.toPng(user.name, 128);
      res.set("Content-Type", "image/png");
      res.send(file);
    }
  } else { // if the user doesn't exist, resort to using the id from url to make the image
    var file = jdenticon.toPng(req.params.user, 128);
    res.set("Content-Type", "image/png");
    res.send(file);
  }
});

app.get("/api/posts/:post", async function (req, res) {
  try {
    var post = await posts.findOne({ _id: req.params.post })
    var poster = await findUserDataByID(post.poster)
    post.poster = {
      name: poster.name,
      id: poster._id
    }
    res.json(post);
  } catch {
    res.status(404).json({ error: "no post found" });
  }
});

app.get("/api/posts/:post/comments", async function (req, res) {
  var post = await posts.findOne({ _id: req.params.post })

  var page = parseInt(req.query.page) || 1;

  var postComments = await comments.find(
    { post: post._id.toString() },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page - 1) * 15 }
  );

  for (var i in postComments) {
    var poster = await findUserDataByID(postComments[i].poster);
    postComments[i].poster = {};
    if (poster) {
      postComments[i].poster.name = poster.name;
      postComments[i].poster.id = poster._id;
    } else {
      postComments[i].poster.name = 'ghost'
      postComments[i].poster.id = '000000000000000000000000'
    }
  }

  var last = false
  var nextComments = await comments.find(
    { post: post._id.toString() },
    { sort: { time: -1, _id: -1 }, limit: 15, skip: (page) * 15 }
  );

  if (nextComments.length == 0) last = true

  res.json({ comments: postComments, last })
})

app.post("/posts/:post/comment", checkLoggedIn(), async function (req, res, next) {
  var user = res.locals.requester;
  var post = await posts.findOne({ _id: req.params.post })
  if (req.is("application/json")) {
    if (post) {
      var content = req.body.content.trim()
      if (content) {
        comments
          .insert({
            content: content,
            poster: user._id.toString(),
            post: req.params.post.toString(),
            time: Date.now()
          })
          .then(async comment => {
            await addMessage(post.poster, `<a href='/users/${user.name}'>@${user.name}</a> commented on <a href='/posts/${post._id}'>your post</a>.`)
            res.json({ ok: "made comment", id: comment._id });
          })
          .catch(err => {
            res.status(500).json({ error: "uncaught server error" });
            console.error(err);
          });
      } else {
        res.status(400).json({ error: 'message cannot be empty' })
      }
    } else {
      res.status(404).json({ error: 'no post found' })
    }
  } else {
    res.status(415).json({ error: "must send json data" });
  }
})

app.delete("/posts/:post", checkLoggedIn(), async function (req, res, next) {
  var user = res.locals.requester;
  var post = await posts.findOne({ _id: req.params.post })
  if (req.xhr) {
    if (post) {
      // check if the requester is the creator of the post OR is an admin
      if (user.admin || post.poster.toString() == user._id.toString()) {
        try {
          await posts.remove({ _id: post._id })
          await comments.remove({ post:post._id.toString() })
          res.json({ ok: 'removed post' })
        } catch (err) {
          console.log(err)
          res.status(500).json({ error: 'something went wrong on the server' })
        }
      } else {
        res.status(403).json({ error: 'requested post for deletion is not made by the same user who requseted' })
      }
    } else {
      res.status(404).json({ error: 'no post found' })
    }
  } else {
    res.status(415).json({ error: "must be xhr" });
  }
})

app.get("/posts/:post", async function (req, res, next) {
  if (req.params.post.length !== 24) return next()
  var loggedInUser = res.locals.requester,
    loggedIn = res.locals.loggedIn,
    post = await posts.findOne({ _id: req.params.post });
  if (post) {
    var poster = await findUserDataByID(post.poster)
    ejs.renderFile(
      __dirname + "/pages/post.ejs",
      { post, poster, loggedInUser, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  } else {
    next()
  }
});

app.post("/post", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;

  if (req.is("application/json")) {
    var content = req.body.post.trim()
    if (content) {
      posts
        .insert({
          content: content,
          poster: user._id,
          time: Date.now(),
          loves: []
        })
        .then(post => {
          res.json({ ok: "made post", id: post._id });
        })
        .catch(err => {
          res.status(500).json({ error: "uncaught server error" });
          console.error(err);
        });
    } else {
      res.status(400).json({ error: "post cannot be empty" })
    }
  } else {
    res.status(415).json({ error: "must send json data" });
  }
});

app.post("/posts/:id/love", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;
  if (req.xhr) {
    await posts.update({ _id: req.params.id }, [{
      $set: {
        loves: {
          $cond: [
            {
              $in: [user._id.toString(), "$loves"]
            },
            {
              $setDifference: ["$loves", [user._id.toString()]]
            },
            {
              $concatArrays: ["$loves", [user._id.toString()]]
            }
          ]
        }
      }
    }])
    var postDB = await posts.findOne({ _id: req.params.id })
    if (postDB) {
      if (postDB.loves.includes(user._id.toString())) {
        res.json({ ok: "loved post", loves: postDB.loves, action: "love" });
      } else {
        res.json({ ok: "unloved", loves: postDB.loves, action: "unlove" });
      }
    } else {
      res.status(404).json({ error: "no post found" });
    }
  } else {
    res.status(403).json({ error: "must be requested with xhr" });
  }
});

app.post("/users/:name/follow", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;
  if (req.xhr) {
    await users.update({ name: req.params.name }, [{
      $set: {
        followers: {
          $cond: [
            {
              $in: [user._id.toString(), "$followers"]
            },
            {
              $setDifference: ["$followers", [user._id.toString()]]
            },
            {
              $concatArrays: ["$followers", [user._id.toString()]]
            }
          ]
        }
      }
    }])
    var userDB = await findUserData(req.params.name)
    if (userDB) {
      var following = await users.find({ followers: { $all: [userDB._id.toString()] } })
      if (userDB.followers.includes(user._id.toString())) {
        res.json({
          ok: "now following",
          action: "follow",
          followers: userDB.followers.length,
          following: following.length,
        });
        addMessage(
          userDB._id,
          `<a href='/users/${user.name}'>@${user.name}</a> is now following you.`
        );
      } else {
        res.json({
          ok: "unfollowing",
          action: "unfollow",
          followers: userDB.followers.length,
          following: following.length,
        });
      }
    } else {
      res.status(404).json({ error: "no user found" });
    }
  } else {
    res.status(403).json({ error: "must be requested with xhr" });
  }
});

app.get('/:user', async (req, res, next) => {
  // user redirect is second last so that if anything above exists then use that instead
  var username = req.params.user
  var user = await findUserData(username)
  if (user) {
    res.redirect(`/users/${username}`)
  } else {
    next()
  }
})

// socket.io live stuff (fun)

var connected = []

io.on('connection', async (socket) => {
  if (socket.handshake.headers.cookie) {
    const cookies = cookie.parse(socket.handshake.headers.cookie)
    var tokenUser = findUser(cookies.token)
    if (tokenUser) {
      var user = await findUserDataByID(tokenUser.id)
      var msgs = await messages.find({ to: user._id.toString(), read: false })
      socket.emit('updateMessageCount', msgs.length)
      connected.push({
        id: user._id.toString(),
        socket: socket
      })

    } else {
      socket.disconnect(true)
    }
  }
});

app.use((req, res, next) => {
  // 404 page always last
  console.log(`404 at ${req.path}`)
  var user = res.locals.requester,
    loggedIn = res.locals.loggedIn;
  res.status(404).send(
    ejs.renderFile(
      __dirname + "/pages/404.ejs",
      { user, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    )
  );
});

function findUser(token) {
  var user = tokens.find(t => t.token == token);
  return user;
}

function findUserData(name) {
  var regexName = "^" + name + "$";
  return new Promise(async (resolve, reject) => {
    try {
      var user = await users.findOne({
        name: { $regex: new RegExp(regexName, "i") }
      });
      resolve(user);
    } catch (error) {
      reject(Error(error));
    }
  });
}

function findUserDataByID(id) {
  id = id.toString()
  if (id.length !== 24) {
    id = "000000000000000000000001" // if the id isn't 12 bytes, use a placeholder. // todo, should this be the ghost?
  }

  return new Promise(async (resolve, reject) => {
    try {
      var user = await users.findOne({ _id: id });
      resolve(user);
    } catch (error) {
      reject(Error(error));
    }
  });
}

function findSocketsByID(id) {
  id = id.toString()
  return connected.filter(s => s.id == id)
}

function addMessage(id, text, time = Date.now()) {
  return new Promise(async (resolve, reject) => {
    try {
      var user = await findUserDataByID(id)

      if (user) {
        const message = {
          content: text,
          to: user._id.toString(),
          read: false,
          time
        }

        var update = await messages.insert(message)

        var msgs = await messages.find({ to: user._id.toString(), read: false })
        var sockets = findSocketsByID(user._id)
        sockets.forEach(s => {
          s.socket.emit('updateMessageCount', msgs.length)
        })
        resolve(update);
      } else {
        reject('no user found')
      }
    } catch (error) {
      reject(Error(error));
    }
  });
}

function makeToken(length) {
  // make login tokens used by the join and login systems
  const set = "abcdefghijklmnopABCDEFGHIJKLMNOP0123456789";
  var res = [
    ...(function* () {
      for (let i = 0; i < length; i++)
        yield set[Math.floor(Math.random() * set.length)];
    })()
  ].join(""); // what the heck is this alien language

  if (tokens.some(e => e.token === res)) {
    // handle the really rare chance that a token already exists
    console.log("the impossible has happend");
    return makeToken(length);
  } else {
    return res;
  }
}

function addToken(token, id, time = 21600000) {
  // 6 hours
  tokens.push({ id: id, token: token });

  setTimeout(() => {
    // remove token after time seconds
    removeToken(token);
  }, time);
}

function removeToken(token) {
  tokens = tokens.filter(obj => {
    return obj.token !== token;
  });
  // console.log(tokens)
}

function paginate(array, page_size, page_number) {
  // human-readable page numbers usually start with 1, so we reduce 1 in the first argument
  return array.slice((page_number - 1) * page_size, page_number * page_size);
}

http.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
