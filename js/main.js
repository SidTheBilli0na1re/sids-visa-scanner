// Common JavaScript functions for all pages

// Press feedback for interactive elements
function attachPressFeedback(element){
  if(!element) return;
  
  element.addEventListener('mousedown', ()=> element.classList.add('pressed'));
  element.addEventListener('mouseup', ()=> element.classList.remove('pressed'));
  element.addEventListener('mouseleave', ()=> element.classList.remove('pressed'));
  
  element.addEventListener('keydown', (e)=>{
    if(e.key === ' ' || e.key === 'Enter'){
      e.preventDefault();
      element.classList.add('pressed');
    }
  });
  element.addEventListener('keyup', (e)=>{
    if(e.key === ' ' || e.key === 'Enter'){
      element.classList.remove('pressed');
      element.click();
    }
  });
}

// Initialize press feedback on all pressable elements
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.pressable').forEach(el => attachPressFeedback(el));
});