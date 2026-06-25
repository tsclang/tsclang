#include "runtime.h"

typedef enum { Pin_PA0 = 0, Pin_PA1 = 1, Pin_PA2 = 2 } Pin;

int main(void) {
    TSC_INIT();
    const Pin p = Pin_PA1;
    printf("%d\n", (int)p);
    return 0;
}
