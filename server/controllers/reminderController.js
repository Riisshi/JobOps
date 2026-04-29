const Reminder = require("../models/Reminder");

exports.getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({ user: req.user.id })
      .populate("application", "company role status")
      .sort({ completed: 1, dueDate: 1 });

    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createReminder = async (req, res) => {
  try {
    const { title, note, type, dueDate, application } = req.body;

    if (!title || !dueDate) {
      return res.status(400).json({ error: "Title and due date are required." });
    }

    const reminder = await Reminder.create({
      title,
      note: note || "",
      type: type || "custom",
      dueDate,
      application: application || undefined,
      user: req.user.id,
    });

    const populated = await reminder.populate("application", "company role status");
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateReminder = async (req, res) => {
  try {
    const { title, note, type, dueDate, completed } = req.body;
    const reminder = await Reminder.findOne({ _id: req.params.id, user: req.user.id });

    if (!reminder) return res.status(404).json({ error: "Reminder not found." });

    if (title !== undefined) reminder.title = title;
    if (note !== undefined) reminder.note = note;
    if (type !== undefined) reminder.type = type;
    if (dueDate !== undefined) reminder.dueDate = dueDate;
    if (completed !== undefined) {
      reminder.completed = completed;
      reminder.completedAt = completed ? new Date() : undefined;
    }

    await reminder.save();
    const populated = await reminder.populate("application", "company role status");
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!reminder) return res.status(404).json({ error: "Reminder not found." });

    res.json({ success: true, id: reminder._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
