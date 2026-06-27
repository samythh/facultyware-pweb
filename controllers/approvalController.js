const db = require('../lib/db');

exports.getInbox = async (req, res, next) => {
  try {
    res.render('inbox', { title: 'Inbox Persetujuan' });
  } catch (error) {
    next(error);
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    res.send('History Page');
  } catch (error) {
    next(error);
  }
};

exports.exportRekap = async (req, res, next) => {
  try {
    res.send('Export Rekap');
  } catch (error) {
    next(error);
  }
};

exports.getDetail = async (req, res, next) => {
  try {
    res.render('detail', { title: 'Detail Persetujuan', id: req.params.id });
  } catch (error) {
    next(error);
  }
};

exports.approveRequest = async (req, res, next) => {
  try {
    res.redirect('/approval');
  } catch (error) {
    next(error);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    res.redirect('/approval');
  } catch (error) {
    next(error);
  }
};

exports.getApiStatus = async (req, res, next) => {
  try {
    res.json({ id: req.params.id, status: 'pending' });
  } catch (error) {
    next(error);
  }
};
