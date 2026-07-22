const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  year: { type: Number, required: true, min: 1, max: 4 },
  branch: { type: String, required: true, enum: ['IT', 'CE', 'EE', 'ME'] },
  type: { type: String, required: true, enum: ['Notes', 'Syllabus', 'CT_Paper', 'Quantum', 'PYQ'] },
  scope: { type: String, enum: ['unit', 'combined'], default: 'combined' },
  unit: { type: Number, min: 1, max: 20, default: null },
  unit_title: { type: String, trim: true, default: null },
  file_path: { type: String, default: null },
  drive_link: { type: String, default: null },
  description: { type: String, default: null },
  uploaded_at: { type: Date, default: Date.now }
});

noteSchema.index({ year: 1, branch: 1, type: 1, subject: 1 });
noteSchema.index({ scope: 1, unit: 1 });

const announcementSchema = new mongoose.Schema({
  text: { type: String, required: true },
  icon: { type: String, default: '📢' },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

const adminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const generalResourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, default: 'General', trim: true },
  description: { type: String, default: null },
  file_path: { type: String, default: null },
  drive_link: { type: String, default: null },
  cover_path: { type: String, default: null },
  uploaded_at: { type: Date, default: Date.now }
});

const feedbackSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  created_at: { type: Date, default: Date.now }
});

function toApiDoc(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = String(obj._id);
  delete obj._id;
  delete obj.__v;
  if (obj.uploaded_at instanceof Date) obj.uploaded_at = obj.uploaded_at.toISOString();
  if (obj.created_at instanceof Date) obj.created_at = obj.created_at.toISOString();
  return obj;
}

const Note = mongoose.model('Note', noteSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const AdminUser = mongoose.model('AdminUser', adminUserSchema);
const GeneralResource = mongoose.model('GeneralResource', generalResourceSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = {
  Note,
  Announcement,
  AdminUser,
  GeneralResource,
  Feedback,
  toApiDoc
};
