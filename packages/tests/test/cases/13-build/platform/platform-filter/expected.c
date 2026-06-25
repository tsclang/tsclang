#include "runtime.h"

void avrOnly(void) {
    printf("avr\n");
}

int main(void) {
    TSC_INIT();
    avrOnly();
    return 0;
}
