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
  // Tabel users (skema Laravel) memakai email sebagai identitas unik;
  // tidak ada kolom username. Terima nilai dari field email/username apa pun.
  const identifier = req.body.email || req.body.username;
  const { password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      identifier,
    ]);

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Email atau kata sandi salah.",
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", {
        title: "Login",
        error: "Email atau kata sandi salah.",
      });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.name;

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
