#include "runtime.h"

typedef struct { TscError _base; } IOError;

int main(void) {
    TSC_INIT();
    return 0;
}
