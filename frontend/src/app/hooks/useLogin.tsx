import { useMutation } from "@tanstack/react-query";
import {api} from "../lib/api";

type LoginData = {
  email: string;
  password: string;
};
export function useLogin(){
    return useMutation({
        mutationFn: async (data : LoginData)=>{
            const response = await api.post("/signin" , data);
            return response.data;
        }
    })
}