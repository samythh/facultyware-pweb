const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const index = (req, res) => {
  res.render("index", { title: "Express" });
};

const home = (req, res) => {
  res.render("home", { title: "Home", user: req.session.username });
};

const loginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/home");
  }
  res.render("login", { title: "Login", error: null });
};

const login = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ? OR name = ?", [
      username, username
    ]);

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Invalid username/email or password",
      });
    }

    const user = rows[0];
    // Attempt bcrypt compare, fallback to plain text compare if not hashed
    const isMatch = await bcrypt.compare(password, user.password).catch(() => false);
    
    if (!isMatch && password !== user.password) {
      return res.render("login", {
        title: "Login",
        error: "Invalid username/email or password",
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.name; // using name since username column doesn't exist

    res.redirect("/home");
  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
};

module.exports = {
  index,
  home,
  loginPage,
  login,
  logout
};
