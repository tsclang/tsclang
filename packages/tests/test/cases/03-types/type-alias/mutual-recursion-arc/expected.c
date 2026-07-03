#include "runtime.h"

typedef struct B B;
typedef struct A A;
struct A { B * b; };
struct B { A * a; };

int main(void) {
    TSC_INIT();
    return 0;
}
