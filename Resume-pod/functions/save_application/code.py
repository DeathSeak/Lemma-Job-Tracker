#input_type_name: SaveAppInput
#output_type_name: SaveAppResult
#function_name: save_application

from pydantic import BaseModel
from typing import Optional, Any
import re
from lemma_sdk import FunctionContext, Pod
import json

class SaveAppInput(BaseModel):
    company: str
    role: str
    job_url: Optional[str] = ""
    agent_output: Any

class SaveAppResult(BaseModel):
    success: bool

async def save_application(ctx: FunctionContext, data: SaveAppInput) -> SaveAppResult:
    pod = Pod.from_env()
    
    # Process text output if raw string, otherwise bind direct dictionary structures.
    parsed = {}
    if isinstance(data.agent_output, str):
        text = data.agent_output
        
        # Extract structured content using standard JSON backticks.
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            cleaned = match.group(1)
        else:
            # Fall back to matching opening and closing curly brackets.
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1 and end > start:
                cleaned = text[start:end+1]
            else:
                cleaned = text

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            # Attempt to split output by standard numbered section headers.
            r_idx = text.lower().find("1. resume")
            o_idx = text.lower().find("2. outreach")
            n_idx = text.lower().find("3. notes")
            
            if r_idx != -1 and o_idx != -1 and n_idx != -1:
                resume_part = text[r_idx:o_idx].strip()
                resume_part = re.sub(r"(?i)^1\.\s*resume\n?", "", resume_part)
                
                outreach_part = text[o_idx:n_idx].strip()
                outreach_part = re.sub(r"(?i)^2\.\s*outreach\n?", "", outreach_part)
                
                notes_part = text[n_idx:].strip()
                notes_part = re.sub(r"(?i)^3\.\s*notes(?:.*)?\n?", "", notes_part)
                
                parsed = {
                    "resume": resume_part.strip(),
                    "outreach": outreach_part.strip(),
                    "notes": notes_part.strip()
                }
            else:
                # Capture all raw text into the resume field as a generic recovery.
                parsed = {
                    "resume": f"**Warning: AI output was not valid JSON. Showing raw output below:**\n\n{text}", 
                    "outreach": "Error: See Tailored Resume tab for raw output.", 
                    "notes": "Error: See Tailored Resume tab for raw output."
                }
    elif isinstance(data.agent_output, dict):
        parsed = data.agent_output

    table = pod.table("applications")
    # Insert columns values into the target applications table.
    table.create({
        "company": data.company,
        "role": data.role,
        "status": "scouted",
        "job_url": data.job_url,
        "resume_changes": parsed.get("resume", ""),
        "outreach_draft": parsed.get("outreach", ""),
        "interview_notes": parsed.get("notes", "")
    })

    return SaveAppResult(success=True)
