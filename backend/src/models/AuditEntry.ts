import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IAuditEntry extends Document {
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  targetType: 'reservation' | 'bottle' | 'user';
  targetId: Types.ObjectId;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditEntrySchema = new Schema<IAuditEntry>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ['reservation', 'bottle', 'user'],
      required: true
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditEntry: Model<IAuditEntry> = mongoose.model<IAuditEntry>(
  'AuditEntry',
  AuditEntrySchema
);
