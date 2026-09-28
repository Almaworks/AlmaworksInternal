/** Fixed messages only: Google errors, auth codes and arbitrary URL text are never displayed. */
export function calendarCallbackNotice(search:string):string|null{
  const outcome=new URLSearchParams(search).get("calendar");
  if(outcome==="permissions")return "Google Calendar was not connected. Try again and select both Calendar permissions on Google's consent screen.";
  if(outcome==="declined")return "Google Calendar was not connected. You can try again or continue without connecting.";
  if(outcome==="changed")return "Your Calendar connection changed. Check the current account below; disconnect it before switching Google accounts.";
  if(outcome==="failed")return "Google Calendar could not connect. You can try again or continue without connecting.";
  return null;
}
