import callApi from "./callApi";

export default async function getUser() {
    try {
        
        let {data} = await callApi(`/api/admin/users/get-user`, {}, 'GET')
        if (data?.data?.user) {
            return data.data.user

        }else{
            return null
        }

    } catch (error) {
        return false
    }
}
