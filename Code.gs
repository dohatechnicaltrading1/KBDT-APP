/**
 * Kashinagar Blood Donation Team (KBDT) App - Backend
 * Google Apps Script Web App connected to a Google Sheet.
 *
 * SETUP:
 * 1. Create a new Google Sheet.
 * 2. Extensions > Apps Script. Delete any starter code, paste this whole file in.
 * 3. Run the `setup` function once (top toolbar > select "setup" > Run).
 *    - It will ask for permissions. Approve them.
 *    - This creates all the sheet tabs + the admin account automatically.
 * 4. Deploy > New deployment > type: "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - Click Deploy, copy the Web App URL.
 * 5. Paste that URL into CONFIG.API_URL in index.html.
 *
 * Admin login (change immediately after first login):
 *   username: Fahim
 *   password: Fahimisthebest
 */

const SHEET_NAMES = {
  USERS: 'Users',
  DONATIONS: 'Donations',
  REQUESTS: 'Requests',
  ADVISORY: 'Advisory',
  COMMITTEE: 'Committee',
  GALLERY: 'Gallery',
  QUIZ: 'Quiz',
  QUESTIONS: 'Questions',
  RESULTS: 'Results',
  SETTINGS: 'Settings'
};

const HEADERS = {
  Users: ['id','role','name','email','mobile','password','bloodGroup','age','gender','presentAddress','permanentAddress','photoUrl','createdAt','isActive','mustChangePassword'],
  Donations: ['id','donorId','donationDate','location','notes','recordedBy','createdAt'],
  Requests: ['id','requesterId','requesterName','targetDonorId','targetDonorName','status','note','requestedAt','resolvedAt','resolvedBy'],
  Advisory: ['id','name','designation','photoUrl','bio','displayOrder'],
  Committee: ['id','name','role','photoUrl','bio','displayOrder'],
  Gallery: ['id','imageUrl','caption','eventName','uploadedBy','uploadedAt'],
  Quiz: ['id','titleEn','titleBn','isPublished','createdBy','createdAt'],
  Questions: ['id','quizId','questionEn','questionBn','optionsEn','optionsBn','correctIndex'],
  Results: ['id','quizId','userId','userName','score','totalQuestions','completedAt'],
  Settings: ['key','value']
};

/* ---------------- SETUP ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[name]);
      sheet.setFrozenRows(1);
    }
  });
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0) ss.deleteSheet(defaultSheet);

  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = usersSheet.getDataRange().getValues();
  const hasAdmin = data.some(row => row[1] === 'admin');
  if (!hasAdmin) {
    usersSheet.appendRow([
      Utilities.getUuid(), 'admin', 'Fahim', '', '', hashPassword('Fahimisthebest'),
      '', '', '', '', '', '', new Date().toISOString(), true, true
    ]);
  }

  const settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const settingsData = settingsSheet.getDataRange().getValues();
  const existingKeys = settingsData.map(r => r[0]);
  const defaults = {
    orgName: 'Kashinagar Blood Donation Team',
    facebookUrl: '',
    announcement: '',
    defaultLanguage: 'en'
  };
  Object.keys(defaults).forEach(key => {
    if (!existingKeys.includes(key)) settingsSheet.appendRow([key, defaults[key]]);
  });

  Logger.log('Setup complete. Admin username: Fahim / password: Fahimisthebest (change on first login).');
}

/* ---------------- HELPERS ---------------- */

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map((row, idx) => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    obj._row = idx + 2;
    return obj;
  });
}

function appendRow(name, obj) {
  const sheet = getSheet(name);
  const headers = HEADERS[name];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.appendRow(row);
  return obj;
}

function updateRowById(name, id, updates) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      headers.forEach((h, col) => {
        if (updates[h] !== undefined) {
          sheet.getRange(i + 1, col + 1).setValue(updates[h]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteRowById(name, id) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const idCol = values[0].indexOf('id');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function findOne(name, matchFn) {
  return sheetToObjects(name).find(matchFn);
}

function hashPassword(pw) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function newId(prefix) {
  return (prefix ? prefix + '-' : '') + Utilities.getUuid().slice(0, 8);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function nextEligibleDate(lastDonationDate) {
  if (!lastDonationDate) return null;
  const d = new Date(lastDonationDate);
  d.setDate(d.getDate() + 90);
  return d.toISOString();
}

function eligibilityStatus(lastDonationDate) {
  if (!lastDonationDate) return 'eligible';
  const next = new Date(nextEligibleDate(lastDonationDate));
  const now = new Date();
  const diffDays = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'eligible';
  if (diffDays <= 7) return 'soon';
  return 'not_yet';
}

/* ---------------- ENTRY POINTS ---------------- */

function doGet(e) {
  return jsonOut({ status: 'ok', message: 'KBDT API is running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const data = body.data || {};
    let result;

    switch (action) {
      case 'signup': result = signup(data); break;
      case 'login': result = login(data); break;
      case 'changePassword': result = changePassword(data); break;
      case 'forgotPassword': result = forgotPasswordReset(data); break;

      case 'getDonors': result = getDonors(data); break;
      case 'getFullDonorDirectory': result = getFullDonorDirectory(data); break;
      case 'updateProfile': result = updateProfile(data); break;
      case 'adminAddDonor': result = adminAddDonor(data); break;
      case 'adminUpdateDonor': result = adminUpdateDonor(data); break;
      case 'adminDeleteDonor': result = adminDeleteDonor(data); break;
      case 'createOrganizer': result = createOrganizer(data); break;
      case 'listOrganizers': result = listOrganizers(); break;
      case 'deactivateOrganizer': result = deactivateOrganizer(data); break;

      case 'recordDonation': result = recordDonation(data); break;
      case 'getEligibilityBoard': result = getEligibilityBoard(); break;
      case 'getMyDonations': result = getMyDonations(data); break;

      case 'requestContact': result = requestContact(data); break;
      case 'getMyRequests': result = getMyRequests(data); break;
      case 'getRequestsQueue': result = getRequestsQueue(); break;
      case 'resolveRequest': result = resolveRequest(data); break;

      case 'getAdvisory': result = sheetToObjects(SHEET_NAMES.ADVISORY); break;
      case 'addAdvisory': result = addBoardMember(SHEET_NAMES.ADVISORY, data); break;
      case 'updateAdvisory': result = updateBoardMember(SHEET_NAMES.ADVISORY, data); break;
      case 'deleteAdvisory': result = deleteBoardMember(SHEET_NAMES.ADVISORY, data); break;

      case 'getCommittee': result = sheetToObjects(SHEET_NAMES.COMMITTEE); break;
      case 'addCommittee': result = addBoardMember(SHEET_NAMES.COMMITTEE, data); break;
      case 'updateCommittee': result = updateBoardMember(SHEET_NAMES.COMMITTEE, data); break;
      case 'deleteCommittee': result = deleteBoardMember(SHEET_NAMES.COMMITTEE, data); break;

      case 'getGallery': result = sheetToObjects(SHEET_NAMES.GALLERY); break;
      case 'addGalleryItem': result = addGalleryItem(data); break;
      case 'deleteGalleryItem': result = deleteGalleryItem(data); break;

      case 'getDonorDonationNumber': result = getDonorDonationNumber(data); break;
      case 'getTotalOrgDonations': result = getTotalOrgDonations(); break;

      case 'getQuizzes': result = getQuizzes(data); break;
      case 'getQuizQuestions': result = getQuizQuestions(data); break;
      case 'createQuiz': result = createQuiz(data); break;
      case 'addQuestion': result = addQuestion(data); break;
      case 'deleteQuestion': result = deleteQuestion(data); break;
      case 'togglePublishQuiz': result = togglePublishQuiz(data); break;
      case 'submitQuizResult': result = submitQuizResult(data); break;
      case 'getQuizResults': result = getQuizResults(data); break;

      case 'getSettings': result = getSettings(); break;
      case 'updateSettings': result = updateSettings(data); break;

      case 'exportDonorsCsv': result = exportDonorsCsv(); break;

      default: result = { error: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message, stack: err.stack });
  }
}

/* ---------------- AUTH ---------------- */

function signup(data) {
  const users = sheetToObjects(SHEET_NAMES.USERS);
  if (users.some(u => u.mobile === data.mobile)) {
    return { error: 'A user with this mobile number already exists.' };
  }
  if (data.email && users.some(u => u.email === data.email)) {
    return { error: 'A user with this email already exists.' };
  }
  const user = {
    id: newId('DNR'),
    role: 'donor',
    name: data.name,
    email: data.email || '',
    mobile: data.mobile,
    password: hashPassword(data.password),
    bloodGroup: data.bloodGroup,
    age: data.age || '',
    gender: data.gender || '',
    presentAddress: data.presentAddress || '',
    permanentAddress: data.permanentAddress || '',
    photoUrl: data.photoUrl || '',
    createdAt: new Date().toISOString(),
    isActive: true,
    mustChangePassword: false
  };
  appendRow(SHEET_NAMES.USERS, user);
  return { success: true, user: sanitizeUser(user) };
}

function login(data) {
  const identifier = data.identifier;
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const user = users.find(u =>
    (u.mobile && u.mobile === identifier) ||
    (u.email && u.email === identifier) ||
    (u.name && u.role !== 'donor' && u.name === identifier)
  );
  if (!user) return { error: 'No account found.' };
  if (user.isActive === false) return { error: 'This account has been deactivated.' };
  if (user.password !== hashPassword(data.password)) return { error: 'Incorrect password.' };
  return { success: true, user: sanitizeUser(user) };
}

function changePassword(data) {
  const user = findOne(SHEET_NAMES.USERS, u => u.id === data.userId);
  if (!user) return { error: 'User not found.' };
  if (user.password !== hashPassword(data.oldPassword)) return { error: 'Old password is incorrect.' };
  updateRowById(SHEET_NAMES.USERS, data.userId, { password: hashPassword(data.newPassword), mustChangePassword: false });
  return { success: true };
}

function forgotPasswordReset(data) {
  const user = findOne(SHEET_NAMES.USERS, u => u.mobile === data.identifier || u.email === data.identifier);
  if (!user) return { error: 'No account found with that mobile/email.' };
  updateRowById(SHEET_NAMES.USERS, user.id, { password: hashPassword(data.newPassword) });
  return { success: true };
}

function sanitizeUser(u) {
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, mobile: u.mobile,
    bloodGroup: u.bloodGroup, age: u.age, gender: u.gender,
    presentAddress: u.presentAddress, permanentAddress: u.permanentAddress,
    photoUrl: u.photoUrl, mustChangePassword: u.mustChangePassword
  };
}

/* ---------------- USERS / DONORS ---------------- */

function getDonors(data) {
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.role === 'donor' && u.isActive !== false);
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS);
  let results = users.map(u => {
    const myDonations = donations.filter(d => d.donorId === u.id).sort((a,b) => new Date(b.donationDate) - new Date(a.donationDate));
    const last = myDonations[0];
    return {
      id: u.id,
      name: u.name,
      bloodGroup: u.bloodGroup,
      area: (u.presentAddress || '').split(',')[0] || '',
      lastDonationMonth: last ? new Date(last.donationDate).toISOString().slice(0,7) : null,
      eligibility: eligibilityStatus(last ? last.donationDate : null)
    };
  });
  if (data.bloodGroup) results = results.filter(r => r.bloodGroup === data.bloodGroup);
  if (data.area) results = results.filter(r => r.area.toLowerCase().includes(data.area.toLowerCase()));
  if (data.eligibility) results = results.filter(r => r.eligibility === data.eligibility);
  return { donors: results };
}

function getFullDonorDirectory(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.role === 'donor');
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS);
  const results = users.map(u => {
    const myDonations = donations.filter(d => d.donorId === u.id).sort((a,b) => new Date(b.donationDate) - new Date(a.donationDate));
    const last = myDonations[0];
    return {
      id: u.id, name: u.name, mobile: u.mobile, email: u.email, bloodGroup: u.bloodGroup,
      age: u.age, gender: u.gender, presentAddress: u.presentAddress, permanentAddress: u.permanentAddress,
      photoUrl: u.photoUrl, isActive: u.isActive,
      lastDonationDate: last ? last.donationDate : null,
      totalDonations: myDonations.length,
      eligibility: eligibilityStatus(last ? last.donationDate : null),
      nextEligibleDate: last ? nextEligibleDate(last.donationDate) : null
    };
  });
  return { donors: results };
}

function updateProfile(data) {
  const updates = {};
  ['name','email','mobile','bloodGroup','age','gender','presentAddress','permanentAddress','photoUrl'].forEach(f => {
    if (data[f] !== undefined) updates[f] = data[f];
  });
  const ok = updateRowById(SHEET_NAMES.USERS, data.userId, updates);
  if (!ok) return { error: 'User not found.' };
  return { success: true };
}

function adminAddDonor(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const user = {
    id: newId('DNR'), role: 'donor', name: data.name, email: data.email || '',
    mobile: data.mobile, password: hashPassword(data.password || 'changeme123'),
    bloodGroup: data.bloodGroup, age: data.age || '', gender: data.gender || '',
    presentAddress: data.presentAddress || '', permanentAddress: data.permanentAddress || '',
    photoUrl: data.photoUrl || '', createdAt: new Date().toISOString(), isActive: true, mustChangePassword: true
  };
  appendRow(SHEET_NAMES.USERS, user);
  return { success: true, donor: sanitizeUser(user) };
}

function adminUpdateDonor(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const updates = {};
  ['name','email','mobile','bloodGroup','age','gender','presentAddress','permanentAddress','photoUrl','isActive'].forEach(f => {
    if (data[f] !== undefined) updates[f] = data[f];
  });
  const ok = updateRowById(SHEET_NAMES.USERS, data.donorId, updates);
  if (!ok) return { error: 'Donor not found.' };
  return { success: true };
}

function adminDeleteDonor(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const ok = deleteRowById(SHEET_NAMES.USERS, data.donorId);
  return ok ? { success: true } : { error: 'Donor not found.' };
}

function createOrganizer(data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can create organizer accounts.' };
  const users = sheetToObjects(SHEET_NAMES.USERS);
  if (users.some(u => u.name === data.username)) return { error: 'Username already taken.' };
  const user = {
    id: newId('ORG'), role: 'organizer', name: data.username, email: data.email || '',
    mobile: data.mobile || '', password: hashPassword(data.tempPassword),
    bloodGroup: '', age: '', gender: '', presentAddress: '', permanentAddress: '',
    photoUrl: '', createdAt: new Date().toISOString(), isActive: true, mustChangePassword: true
  };
  appendRow(SHEET_NAMES.USERS, user);
  return { success: true, organizer: sanitizeUser(user) };
}

function listOrganizers() {
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.role === 'organizer');
  return { organizers: users.map(sanitizeUser) };
}

function deactivateOrganizer(data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can do this.' };
  updateRowById(SHEET_NAMES.USERS, data.organizerId, { isActive: false });
  return { success: true };
}

/* ---------------- DONATIONS / ELIGIBILITY ---------------- */

function recordDonation(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const donation = {
    id: newId('DON'), donorId: data.donorId, donationDate: data.donationDate,
    location: data.location || '', notes: data.notes || '', recordedBy: data.requesterId,
    createdAt: new Date().toISOString()
  };
  appendRow(SHEET_NAMES.DONATIONS, donation);
  return { success: true, donation };
}

function getMyDonations(data) {
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS)
    .filter(d => d.donorId === data.userId)
    .sort((a,b) => new Date(b.donationDate) - new Date(a.donationDate));
  const last = donations[0];
  return {
    donations,
    totalDonations: donations.length,
    eligibility: eligibilityStatus(last ? last.donationDate : null),
    nextEligibleDate: last ? nextEligibleDate(last.donationDate) : null
  };
}

function getEligibilityBoard() {
  const users = sheetToObjects(SHEET_NAMES.USERS).filter(u => u.role === 'donor' && u.isActive !== false);
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS);
  const board = {};
  ['A+','A-','B+','B-','O+','O-','AB+','AB-'].forEach(bg => board[bg] = []);
  users.forEach(u => {
    const myDonations = donations.filter(d => d.donorId === u.id).sort((a,b) => new Date(b.donationDate) - new Date(a.donationDate));
    const last = myDonations[0];
    const status = eligibilityStatus(last ? last.donationDate : null);
    if (board[u.bloodGroup]) {
      board[u.bloodGroup].push({
        id: u.id, name: u.name, mobile: u.mobile, status,
        nextEligibleDate: last ? nextEligibleDate(last.donationDate) : null
      });
    }
  });
  return { board };
}

/* ---------------- REQUESTS ---------------- */

function requestContact(data) {
  const requester = findOne(SHEET_NAMES.USERS, u => u.id === data.requesterId);
  const target = findOne(SHEET_NAMES.USERS, u => u.id === data.targetDonorId);
  if (!requester || !target) return { error: 'User not found.' };
  const existing = findOne(SHEET_NAMES.REQUESTS, r => r.requesterId === data.requesterId && r.targetDonorId === data.targetDonorId && r.status === 'pending');
  if (existing) return { error: 'You already have a pending request for this donor.' };
  const request = {
    id: newId('REQ'), requesterId: requester.id, requesterName: requester.name,
    targetDonorId: target.id, targetDonorName: target.name, status: 'pending', note: '',
    requestedAt: new Date().toISOString(), resolvedAt: '', resolvedBy: ''
  };
  appendRow(SHEET_NAMES.REQUESTS, request);
  return { success: true, request };
}

function getMyRequests(data) {
  const requests = sheetToObjects(SHEET_NAMES.REQUESTS).filter(r => r.requesterId === data.userId);
  const users = sheetToObjects(SHEET_NAMES.USERS);
  const enriched = requests.map(r => {
    if (r.status === 'approved') {
      const target = users.find(u => u.id === r.targetDonorId);
      if (target) {
        r.targetMobile = target.mobile;
        r.targetAddress = target.presentAddress;
      }
    }
    return r;
  });
  return { requests: enriched };
}

function getRequestsQueue() {
  const requests = sheetToObjects(SHEET_NAMES.REQUESTS).filter(r => r.status === 'pending');
  return { requests };
}

function resolveRequest(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const updates = {
    status: data.approve ? 'approved' : 'rejected',
    note: data.note || '',
    resolvedAt: new Date().toISOString(),
    resolvedBy: data.requesterId
  };
  const ok = updateRowById(SHEET_NAMES.REQUESTS, data.requestId, updates);
  return ok ? { success: true } : { error: 'Request not found.' };
}

/* ---------------- ADVISORY / COMMITTEE ---------------- */

function addBoardMember(sheetName, data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can manage this.' };
  const member = {
    id: newId('BM'), name: data.name,
    designation: data.designation || '', role: data.role || '',
    photoUrl: data.photoUrl || '', bio: data.bio || '', displayOrder: data.displayOrder || 0
  };
  appendRow(sheetName, member);
  return { success: true, member };
}

function updateBoardMember(sheetName, data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can manage this.' };
  const updates = {};
  ['name','designation','role','photoUrl','bio','displayOrder'].forEach(f => {
    if (data[f] !== undefined) updates[f] = data[f];
  });
  const ok = updateRowById(sheetName, data.id, updates);
  return ok ? { success: true } : { error: 'Not found.' };
}

function deleteBoardMember(sheetName, data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can manage this.' };
  const ok = deleteRowById(sheetName, data.id);
  return ok ? { success: true } : { error: 'Not found.' };
}

/* ---------------- GALLERY ---------------- */

function addGalleryItem(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const item = {
    id: newId('GAL'), imageUrl: data.imageUrl, caption: data.caption || '',
    eventName: data.eventName || '', uploadedBy: data.requesterId, uploadedAt: new Date().toISOString()
  };
  appendRow(SHEET_NAMES.GALLERY, item);
  return { success: true, item };
}

function deleteGalleryItem(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const ok = deleteRowById(SHEET_NAMES.GALLERY, data.id);
  return ok ? { success: true } : { error: 'Not found.' };
}

/* ---------------- PHOTO CARDS ---------------- */

function getDonorDonationNumber(data) {
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS)
    .filter(d => d.donorId === data.donorId)
    .sort((a,b) => new Date(a.donationDate) - new Date(b.donationDate));
  return { donationNumber: donations.length };
}

function getTotalOrgDonations() {
  const donations = sheetToObjects(SHEET_NAMES.DONATIONS);
  return { total: donations.length };
}

/* ---------------- QUIZ ---------------- */

function getQuizzes(data) {
  let quizzes = sheetToObjects(SHEET_NAMES.QUIZ);
  if (!data || !['admin','organizer'].includes(data.requesterRole)) {
    quizzes = quizzes.filter(q => q.isPublished === true || q.isPublished === 'TRUE');
  }
  return { quizzes };
}

function getQuizQuestions(data) {
  const questions = sheetToObjects(SHEET_NAMES.QUESTIONS).filter(q => q.quizId === data.quizId);
  return { questions };
}

function createQuiz(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const quiz = {
    id: newId('QZ'), titleEn: data.titleEn, titleBn: data.titleBn || '',
    isPublished: false, createdBy: data.requesterId, createdAt: new Date().toISOString()
  };
  appendRow(SHEET_NAMES.QUIZ, quiz);
  return { success: true, quiz };
}

function addQuestion(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const question = {
    id: newId('Q'), quizId: data.quizId, questionEn: data.questionEn, questionBn: data.questionBn || '',
    optionsEn: JSON.stringify(data.optionsEn || []), optionsBn: JSON.stringify(data.optionsBn || []),
    correctIndex: data.correctIndex
  };
  appendRow(SHEET_NAMES.QUESTIONS, question);
  return { success: true, question };
}

function deleteQuestion(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const ok = deleteRowById(SHEET_NAMES.QUESTIONS, data.id);
  return ok ? { success: true } : { error: 'Not found.' };
}

function togglePublishQuiz(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const ok = updateRowById(SHEET_NAMES.QUIZ, data.quizId, { isPublished: data.publish });
  return ok ? { success: true } : { error: 'Not found.' };
}

function submitQuizResult(data) {
  const result = {
    id: newId('RES'), quizId: data.quizId, userId: data.userId, userName: data.userName,
    score: data.score, totalQuestions: data.totalQuestions, completedAt: new Date().toISOString()
  };
  appendRow(SHEET_NAMES.RESULTS, result);
  return { success: true, result };
}

function getQuizResults(data) {
  if (!['admin','organizer'].includes(data.requesterRole)) return { error: 'Not authorized.' };
  const results = sheetToObjects(SHEET_NAMES.RESULTS).filter(r => !data.quizId || r.quizId === data.quizId);
  return { results };
}

/* ---------------- SETTINGS ---------------- */

function getSettings() {
  const rows = sheetToObjects(SHEET_NAMES.SETTINGS);
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  return { settings };
}

function updateSettings(data) {
  if (data.requesterRole !== 'admin') return { error: 'Only Admin can update settings.' };
  Object.keys(data.settings || {}).forEach(key => {
    const sheet = getSheet(SHEET_NAMES.SETTINGS);
    const values = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(data.settings[key]);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, data.settings[key]]);
  });
  return { success: true };
}

/* ---------------- EXPORT ---------------- */

function exportDonorsCsv() {
  const donors = getFullDonorDirectory({ requesterRole: 'admin' }).donors;
  const headers = ['id','name','mobile','email','bloodGroup','age','gender','presentAddress','permanentAddress','totalDonations','lastDonationDate','eligibility'];
  let csv = headers.join(',') + '\n';
  donors.forEach(d => {
    csv += headers.map(h => `"${(d[h] !== undefined && d[h] !== null ? d[h] : '').toString().replace(/"/g,'""')}"`).join(',') + '\n';
  });
  return { csv };
}
