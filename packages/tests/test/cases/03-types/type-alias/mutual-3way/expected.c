#include "runtime.h"

typedef struct B B;
typedef struct A A;
struct A { B * b; };
typedef struct C C;
struct B { C * c; };
struct C { A * a; };

int main(void) {
    TSC_INIT();
    return 0;
}
