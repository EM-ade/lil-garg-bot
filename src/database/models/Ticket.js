const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    // Ticket identification
    ticketId: {
      type: String,
      required: true,
      unique: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      unique: true,
    },

    // Ticket creator
    creator: {
      id: {
        type: String,
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      discriminator: String,
    },

    // Ticket details
    subject: {
      type: String,
      required: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      enum: ["general", "support", "bug", "feature", "billing", "other"],
      default: "general",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    // Ticket status
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting", "resolved", "closed"],
      default: "open",
    },

    // Staff assignment
    assignedTo: {
      id: String,
      username: String,
      assignedAt: Date,
    },

    // Ticket activity
    messages: [
      {
        authorId: String,
        authorUsername: String,
        content: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        isStaff: Boolean,
      },
    ],

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },

    // Resolution
    resolution: {
      summary: String,
      resolvedBy: {
        id: String,
        username: String,
      },
      resolvedAt: Date,
    },

    // Settings
    autoCloseAfter: {
      type: Number,
      default: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Instance methods
ticketSchema.methods.addMessage = function(messageData) {
  this.messages.push(messageData);
  this.lastActivity = new Date();
  this.updatedAt = new Date();
  return this.save();
};

ticketSchema.methods.assignStaff = function(staffId, staffUsername) {
  this.assignedTo = {
    id: staffId,
    username: staffUsername,
    assignedAt: new Date(),
  };
  this.status = "in_progress";
  this.lastActivity = new Date();
  return this.save();
};

ticketSchema.methods.updateStatus = function(newStatus, updatedBy = null) {
  this.status = newStatus;
  this.lastActivity = new Date();
  this.updatedAt = new Date();
  
  if (newStatus === "resolved" && updatedBy) {
    this.resolution = {
      resolvedBy: updatedBy,
      resolvedAt: new Date(),
    };
  } else if (newStatus === "closed") {
    this.closedAt = new Date();
  }
  
  return this.save();
};

ticketSchema.methods.closeTicket = function(closedBy, summary = null) {
  this.status = "closed";
  this.closedAt = new Date();
  this.lastActivity = new Date();
  
  if (summary) {
    this.resolution = {
      summary: summary,
      resolvedBy: closedBy,
      resolvedAt: new Date(),
    };
  }
  
  return this.save();
};

ticketSchema.methods.isStale = function() {
  if (this.status === "closed") return false;
  
  const now = new Date();
  const timeSinceLastActivity = now - this.lastActivity;
  return timeSinceLastActivity > this.autoCloseAfter;
};

ticketSchema.methods.getTicketNumber = function() {
  return this.ticketId.split("-")[1];
};

// Static methods
ticketSchema.statics.generateTicketId = function(guildId) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${guildId}-${timestamp}-${random}`;
};

ticketSchema.statics.findOpenTickets = function(guildId) {
  return this.find({
    guildId: guildId,
    status: { $in: ["open", "in_progress", "waiting"] },
  }).sort({ updatedAt: -1 });
};

ticketSchema.statics.findUserTickets = function(userId, guildId) {
  return this.find({
    "creator.id": userId,
    guildId: guildId,
  }).sort({ createdAt: -1 });
};

ticketSchema.statics.findStaleTickets = function() {
  const now = new Date();
  return this.find({
    status: { $ne: "closed" },
    lastActivity: { $lt: new Date(now - 7 * 24 * 60 * 60 * 1000) },
  });
};

// Pre-save middleware
ticketSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Ticket", ticketSchema);
