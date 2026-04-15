#include "runtime.h"

typedef struct { String name; } Animal;
typedef struct { Animal _base; } Dog;

int main(void) {
    TSC_INIT();
    return 0;
}
