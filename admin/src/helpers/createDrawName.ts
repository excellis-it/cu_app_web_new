import { timeFormatHMSA } from "./dateFormats"

export default function createDrawName(draw:DrawObject){
    try {
        const {name, number, drawTime} = draw
        if(!name) throw new Error('Draw Name is empty')
        if(!number) throw new Error('Draw Number is empty')
        if(!drawTime) throw new Error('Draw Time is empty')

        return `${number}. ${name} - ${timeFormatHMSA(drawTime)}`
    } catch (error) {
        return ''        
    }
}


type DrawObject = {
    name: string,
    number: number,
    drawTime: string
}