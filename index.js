const express = require("express");
const ejs = require("ejs");
const marked = require("marked");
const matter = require("gray-matter");
const rateLimit = require("express-rate-limit");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var bcrypt = require("bcrypt");
var sizeOf = require('image-size');
const fs = require("fs");
const path = require("path");

const jdenticon = require("jdenticon");

require("dotenv").config();

const port = process.env.LISTEN_PORT || 8080;
const app = express();

const db = require("monk")(process.env.DB_URL);

//database
const users = db.get("users"),
  posts = db.get("posts");

users.createIndex("name", { unique: true });

const saltRounds = 10;

var tokens = [];

const usernameRegex = /^[a-z0-9_\-]{1,20}$/;

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
      console.log(tokens);
    }
  } else {
    res.locals.loggedIn = false;
  }
  next();
});

app.use(
  "/api/",
  rateLimit({
    windowMs: 3600000,
    max: 100,
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
              followers: [],
              messages: {
                unread: [],
                read: []
              }
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

  if (loggedIn) {
    // logged in, show posts by people user is following etc
    ejs.renderFile(
      __dirname + "/pages/explore.ejs",
      { user, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  } else {
    //logged out explore page, show trending posts etc
    ejs.renderFile(
      __dirname + "/pages/explore.ejs",
      { user, loggedIn },
      (err, str) => {
        if (err) console.log(err);
        res.send(str);
      }
    );
  }
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

app.get("/api/messages", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester,
    page = parseInt(req.query.page) || 1;

  var unread = user.messages.unread, // don't paginate unread messages?
    read = paginate(user.messages.read, 15, page),
    last = false;
  if (paginate(user.messages.read, 15, page + 1).length == 0) last = true; //set last to true if this is the last page
  console.log(read);
  var messages = {
    unread,
    read,
    last
  };
  messages.unread = messages.unread.sort(function (x, y) {
    return y.time - x.time;
  });
  messages.read = messages.read.sort(function (x, y) {
    return y.time - x.time;
  });
  res.json(messages);
});

app.get("/api/messages/count", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester,
    messages = user.messages;
  res.json({ count: messages.unread.length });
});

app.post("/api/messages/read", checkLoggedIn(), async (req, res) => {
  var user = res.locals.requester;

  if (req.xhr) {
    var messages = user.messages;
    messages.read = messages.read.concat(messages.unread);
    messages.unread = [];
    try {
      await users.update({ name: user.name }, { $set: { messages } });
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
    console.log(following)
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
  var user = await findUserData(req.params.user),
    userPosts = await posts.find(
      { poster: user._id },
      { sort: { time: -1, _id: -1 } }
    ); //sort by time but fallback to id

  for (var i in userPosts) {
    var poster = await findUserDataByID(userPosts[i].poster);
    userPosts[i].poster = poster.name; // this is inefficent, we know the user will always be the smae, but mongodb is webscale so this won't be an issue
    userPosts[i].posterID = poster._id
  }

  var page = parseInt(req.query.page) || 1;
  if (user) {
    var pagePosts = paginate(userPosts, 15, page),
      last = false;
    if (paginate(userPosts, 15, page + 1).length == 0) last = true; //set last to true if this is the last page
    res.json({ posts: pagePosts, last });
  } else {
    res.status(404).json({ error: "no user found" });
  }
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

app.delete("/picture/:user", checkLoggedIn(), async (req, res) => { // 
  var requester = res.locals.requester
  if(!req.xhr) return res.status(403).json({ error: "must be requested with xhr" });
  
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
  if(!req.xhr) return res.status(403).json({ error: "must be requested with xhr" });
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
    var post = await posts.findOne({ _id: req.params.post }),
      poster = await findUserDataByID(post.poster);
    post.poster = poster.name;
    res.json(post);
  } catch {
    res.status(404).json({ error: "no post found" });
  }
});

app.get("/posts/:post", async function (req, res, next) {
  try {
    var post = await posts.findOne({ _id: req.params.post }),
      poster = await findUserDataByID(post.poster);
    res.redirect(`/users/${poster.name}?post=${post._id}`);
  } catch {
    next(); //404
  }
});

app.post("/post", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;

  if (req.is("application/json")) {
    posts
      .insert({
        content: req.body.post,
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
    res.status(415).json({ error: "must send json data" });
  }
});

app.post("/posts/:id/love", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;
  if (req.xhr) {
    try {
      posts
        .findOne({ _id: req.params.id })
        .then(post => {
          if (post) {
            var loves = post.loves || [];
            if (!loves.includes(user._id.toString())) {
              loves.push(user._id.toString());
              posts
                .update({ _id: req.params.id }, { $set: { loves: loves } })
                .then(() => {
                  res.json({ ok: "loved post", loves: loves, action: "love" });
                })
                .catch(updateerr => {
                  console.log(updateerr);
                  res.status(500).json({
                    error: "uncaught database error: " + updateerr.code
                  }); // todo: don't do this on prod.
                });
            } else {
              loves = loves.filter(i => i !== user._id.toString());
              posts
                .update({ _id: req.params.id }, { $set: { loves: loves } })
                .then(() => {
                  res.json({ ok: "unloved", loves: loves, action: "unlove" });
                })
                .catch(updateerr => {
                  console.log(updateerr);
                  res.status(500).json({
                    error: "uncaught database error: " + updateerr.code
                  }); // todo: don't do this on prod.
                });
            }
          } else {
            res.json({ eror: "post not found" });
          }
        })
        .catch(err => {
          res
            .status(500)
            .json({ error: "uncaught database error: " + err.code }); // todo: don't do this on prod.
        });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "oops something went wrong" });
    }
  } else {
    res.status(403).json({ error: "must be requested with xhr" });
  }
});

app.post("/users/:name/follow", checkLoggedIn(), async function (req, res) {
  var user = res.locals.requester;
  if (req.xhr) {
    var followUser = await findUserData(req.params.name);
    if (followUser) {

      var followers = followUser.followers || [];
      if (followers.includes(user._id.toString())) {
        //already follower, unfollow
        followers = followers.filter(i => i !== user._id.toString());

        try {
          await users.update(
            { name: followUser.name },
            { $set: { followers } }
          );

          var following = await users.find({ followers: { $all: [followUser._id.toString()] } })


          res.json({
            ok: "unfollowing",
            action: "unfollow",
            followers: followers.length,
            following: following.length,
          });
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .json({ error: "uncaught database error: " + error.code }); // todo: don't do this on prod.
        }
      } else {
        //follow
        try {
          await users.update(
            { name: followUser.name },
            { $push: { followers: user._id.toString() } }
          );
          addMessage(
            followUser.name,
            `<a href='/users/${user.name}'>@${user.name}</a> is now following you.`
          );

          var following = await users.find({ followers: { $all: [followUser._id.toString()] } })

          res.json({
            ok: "now following",
            action: "follow",
            followers: followers.length + 1,
            following: following.length,
          });
        } catch (error) {
          console.log(error);
          res
            .status(500)
            .json({ error: "uncaught database error: " + error.code }); // todo: don't do this on prod.
        }
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
    console.log('user found')
    res.redirect(`/users/${username}`)
  } else {
    next()
  }
})

app.use((req, res, next) => {
  // 404 page always last
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
    id = "000000000000000000000000" // if the id isn't 12 bytes, use a placeholder
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

function addMessage(name, text, time = Date.now()) {
  return new Promise(async (resolve, reject) => {
    try {
      var user = await findUserData(name),
        messages = user.messages;

      messages.unread.push({
        content: text,
        time
      });
      var update = await users.update({ name: name }, { $set: { messages } });
      resolve(update);
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

app.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});
