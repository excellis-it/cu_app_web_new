
export default function serverResponse(success: boolean, message: string, data: any, res: any, status: number = 200) {
    if (!success) return res.status(status).json({
        success: false,
        message,
        error: data
    });
    else return res.status(status).json({
        success: true,
        message,
        data,
    });
}