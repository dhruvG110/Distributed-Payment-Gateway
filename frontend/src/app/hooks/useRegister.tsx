import { useMutation } from "@tanstack/react-query";
import {api} from "../lib/api";

type RegisterData = {
  name: string;
  email: string;
  password: string;
};
export function useRegister(){
    return useMutation({
        mutationFn: async (data : RegisterData)=>{
            const response = await api.post("/register" , data);
            return response.data;
        }
    })
}