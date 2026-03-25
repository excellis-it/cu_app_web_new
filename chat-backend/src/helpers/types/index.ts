export type MessageObject = {
  senderId: string;
  message: string;
  sentTime: Date;
  receivedTime?: Date;
  deliveredTime?: Date;
  readTime?: Date;
  status: "Sent" | "Delivered" | "Read";
  receiverId: string;
  token?: string;
};
