#include "runtime.h"

ISR(TIMER1_COMPA_vect) {
}

int main(void) {
    TSC_INIT();
    return 0;
}
