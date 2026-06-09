#include "runtime.h"

typedef enum { Bits_A = 0b001, Bits_B = 0b010, Bits_C = 0b100 } Bits;
static const Bits Bits_values[] = { Bits_A, Bits_B, Bits_C };
static const char *Bits_toString(Bits v) {
    switch (v) {
        case Bits_A: return "A";
        case Bits_B: return "B";
        case Bits_C: return "C";
        default: return "unknown";
    }
}

int main(void) {
    TSC_INIT();
    printf("%s\n", Bits_toString(Bits_A));
    printf("%s\n", Bits_toString(Bits_B));
    printf("%s\n", Bits_toString(Bits_C));
    return 0;
}
