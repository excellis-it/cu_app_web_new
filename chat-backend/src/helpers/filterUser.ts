export default function filterUser(user: any) {
    try {
        const { _id, sl, username, email, image, name, phone, accountStatus, userType, createdAt, updatedAt } = user;
        return { _id, sl, username, email, image, name, phone, accountStatus, userType, createdAt, updatedAt };
    } catch (error) {
        return {};
    }
}