export const adminUserTypes = ['SuperAdmin', 'admin', 'accounts', 'store'];


export const toEnumUserTypes: { [key: string]: string } = {
    "Super Admin": "SuperAdmin",
    "Admin": "admin",
    "Member": "user",
    "User": "user",
    "Members": "user",
    "Users": "user",
    "user": "user",
    "member": "user",
    "admin": "admin",
}

export const fromEnumUserTypes: { [key: string]: string } = { 
    'super-admin': 'Super Admin', 
    'SuperAdmin': 'Super Admin',
    'admin': 'Admin', 
    'user': 'Member' 
}

 