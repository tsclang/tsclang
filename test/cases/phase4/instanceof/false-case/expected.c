#include "runtime.h"

typedef struct { void (*speak)(void *self); } Animal_vtable;
typedef struct { void *self; const Animal_vtable *vtable; } Animal;

typedef struct { int _dummy; } Dog;
typedef struct { int _dummy; } Cat;

static void Dog_speak(const Dog *self) {
    printf("woof\n");
}

static void Cat_speak(const Cat *self) {
    printf("meow\n");
}

static const Animal_vtable _Dog_Animal_vtable = {
    .speak = (void (*)(void *))Dog_speak,
};

static const Animal_vtable _Cat_Animal_vtable = {
    .speak = (void (*)(void *))Cat_speak,
};

int main(void) {
    TSC_INIT();
    Dog _dog_0 = {0};
    Animal a = { .self = &_dog_0, .vtable = &_Dog_Animal_vtable };
    if (a.vtable == &_Cat_Animal_vtable) {
        printf("cat\n");
    } else {
        printf("not cat\n");
    }
    return 0;
}
