import camelCaseToSentenceCase from "./camelCaseToSentenceCase";

export default function parseMongoErrors(mongooseError:any) {
   
    const { message, code, keyPattern,keyValue, errors } = mongooseError;
        if(code === 11000) {
        const field = Object.keys(keyValue)[0];
        const value = Object.values(keyValue)[0];
        return {
            field, value, message: `${camelCaseToSentenceCase(field)} "${value}" already exists.`, code: 11000
        }
    } 
    else if (mongooseError.name === 'ValidationError') {
        const errorMessages = [];

        // Extract error messages from the Mongoose error
        for (let field in mongooseError.errors) {
            if (mongooseError.errors.hasOwnProperty(field)) {
                const error = mongooseError.errors[field];
                if (error.kind === 'required') {
                    errorMessages.push(`${camelCaseToSentenceCase(error.path)} is required.`);
                } else if (error.kind === 'unique') {
                    errorMessages.push(`${error.path} already exists.`);
                } else {
                    errorMessages.push(error.message);
                }
            }
        }

        // Construct a presentable error message
        const errorMessage = `Validation failed: ${errorMessages.join(', ')}`;
        return {message: errorMessage, code: 11100};
    } else {
        // For other types of errors, return a generic message
        return mongooseError;
    }
}
