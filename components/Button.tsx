import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}


const Button = forwardRef

Button.displayName = 'Button'
 
export default Button;